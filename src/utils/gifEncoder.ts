// Minimal, self-contained, browser-compatible GIF89a encoder for pixel art animations

interface FrameData {
  pixels: Uint8ClampedArray; // RGBA
  delayMs: number;
}

export function createAnimatedGif(
  width: number,
  height: number,
  frames: FrameData[]
): Blob {
  if (frames.length === 0) throw new Error('No frames to encode');

  // 1. Build a global color table (up to 256 colors) from all frames
  // Reserve index 0 for transparency
  const colorMap = new Map<string, number>();
  const palette: [number, number, number][] = [[255, 0, 255]]; // index 0 is transparent key
  let nextIndex = 1;

  for (const frame of frames) {
    const px = frame.pixels;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue; // transparent
      const key = `${px[i]},${px[i + 1]},${px[i + 2]}`;
      if (!colorMap.has(key)) {
        if (nextIndex < 256) {
          colorMap.set(key, nextIndex++);
          palette.push([px[i], px[i + 1], px[i + 2]]);
        }
      }
    }
  }

  // Pad palette to power of 2 (at least 2, up to 256)
  let tableSize = 2;
  while (tableSize < palette.length && tableSize < 256) {
    tableSize *= 2;
  }
  while (palette.length < tableSize) {
    palette.push([0, 0, 0]);
  }
  const colorDepth = Math.max(1, Math.ceil(Math.log2(tableSize)));

  const bytes: number[] = [];
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };
  const write16 = (n: number) => {
    bytes.push(n & 0xff);
    bytes.push((n >> 8) & 0xff);
  };

  // Header: GIF89a
  writeStr('GIF89a');

  // Logical Screen Descriptor
  write16(width);
  write16(height);
  // Packed: Global Color Table Flag (1), Color Resolution (3 bits), Sort Flag (0), Size of Global Color Table (3 bits)
  const gctFlag = 0x80;
  const cr = (colorDepth - 1) << 4;
  const gctSize = colorDepth - 1;
  bytes.push(gctFlag | cr | gctSize);
  bytes.push(0); // Background Color Index (0 is transparent)
  bytes.push(0); // Pixel Aspect Ratio

  // Global Color Table
  for (let i = 0; i < tableSize; i++) {
    bytes.push(palette[i][0]);
    bytes.push(palette[i][1]);
    bytes.push(palette[i][2]);
  }

  // Netscape Application Extension for infinite looping
  bytes.push(0x21, 0xff, 0x0b);
  writeStr('NETSCAPE2.0');
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

  // Encode each frame
  for (const frame of frames) {
    const delayHundredths = Math.max(1, Math.round(frame.delayMs / 10));

    // Graphic Control Extension
    bytes.push(0x21, 0xf9, 0x04);
    // Packed: Disposal Method (2 = restore to background), User Input (0), Transparent Color Flag (1)
    bytes.push(0x09); // 000 010 0 1 -> 0x09
    write16(delayHundredths);
    bytes.push(0); // Transparent color index = 0
    bytes.push(0); // Block Terminator

    // Image Descriptor
    bytes.push(0x2c);
    write16(0); // Left
    write16(0); // Top
    write16(width);
    write16(height);
    bytes.push(0); // No Local Color Table, not interlaced

    // Indexed pixels
    const indexed: number[] = new Array(width * height);
    const px = frame.pixels;
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
      if (px[i + 3] < 128) {
        indexed[p] = 0; // transparent index
      } else {
        const key = `${px[i]},${px[i + 1]},${px[i + 2]}`;
        indexed[p] = colorMap.get(key) ?? 1;
      }
    }

    // LZW compression
    const minCodeSize = Math.max(2, colorDepth);
    bytes.push(minCodeSize);

    const lzwBlocks = lzwCompress(indexed, minCodeSize);
    for (const block of lzwBlocks) {
      bytes.push(block.length);
      for (const b of block) bytes.push(b);
    }
    bytes.push(0); // Block terminator
  }

  // Trailer
  bytes.push(0x3b);

  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

// Simple standard LZW compressor for GIF
function lzwCompress(indices: number[], minCodeSize: number): number[][] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxTableSize = 4096;

  let dict = new Map<string, number>();
  const resetDict = () => {
    dict = new Map<string, number>();
    for (let i = 0; i < clearCode; i++) {
      dict.set(String.fromCharCode(i), i);
    }
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  resetDict();

  const outCodes: number[] = [clearCode];
  let curPrefix = '';

  for (let i = 0; i < indices.length; i++) {
    const ch = String.fromCharCode(indices[i]);
    const nextPrefix = curPrefix + ch;
    if (dict.has(nextPrefix)) {
      curPrefix = nextPrefix;
    } else {
      outCodes.push(dict.get(curPrefix)!);
      if (nextCode < maxTableSize) {
        dict.set(nextPrefix, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        outCodes.push(clearCode);
        resetDict();
      }
      curPrefix = ch;
    }
  }

  if (curPrefix.length > 0) {
    outCodes.push(dict.get(curPrefix)!);
  }
  outCodes.push(eoiCode);

  // Pack variable-length codes into byte stream
  const rawBytes: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;
  let curCodeSize = minCodeSize + 1;
  let curNext = eoiCode + 1;

  for (let c = 0; c < outCodes.length; c++) {
    const code = outCodes[c];

    bitBuf |= code << bitCount;
    bitCount += curCodeSize;

    while (bitCount >= 8) {
      rawBytes.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }

    if (code === clearCode) {
      curCodeSize = minCodeSize + 1;
      curNext = eoiCode + 1;
    } else if (code !== eoiCode) {
      curNext++;
      if (curNext > (1 << curCodeSize) && curCodeSize < 12) {
        curCodeSize++;
      }
    }
  }

  if (bitCount > 0) {
    rawBytes.push(bitBuf & 0xff);
  }

  // Chunk into 255-byte sub-blocks
  const blocks: number[][] = [];
  for (let i = 0; i < rawBytes.length; i += 255) {
    blocks.push(rawBytes.slice(i, i + 255));
  }
  return blocks;
}
