import JSZip from 'jszip';
import { LibraryItem } from '../types';
import { createAnimatedGif } from './gifEncoder';

// Helper to trigger file download
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Convert data URL to Blob
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Load Image from data URL
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('/') && !src.startsWith('.')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image from ${src}: ${err}`));
    img.src = src;
  });
}

// Export animated GIF for an animation sheet or sequence of frames
export async function exportAssetAsGif(
  item: LibraryItem,
  fps: number = 8
): Promise<Blob> {
  const frames = item.frames && item.frames.length > 0 ? item.frames : [item.cleanedImage];
  const frameWidth = item.metadata.frameWidth || 16;
  const frameHeight = item.metadata.frameHeight || 24;

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const frameDataList = [];
  const delayMs = Math.round(1000 / (fps || 8));

  for (const frameSrc of frames) {
    const img = await loadImage(frameSrc);
    ctx.clearRect(0, 0, frameWidth, frameHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, frameWidth, frameHeight);

    const imgData = ctx.getImageData(0, 0, frameWidth, frameHeight);
    frameDataList.push({
      pixels: imgData.data,
      delayMs,
    });
  }

  return createAnimatedGif(frameWidth, frameHeight, frameDataList);
}

// Export single asset individual frames as a ZIP
export async function exportFramesZip(item: LibraryItem): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(`${item.name}_frames`)!;

  if (item.frames && item.frames.length > 0) {
    for (let i = 0; i < item.frames.length; i++) {
      const blob = dataUrlToBlob(item.frames[i]);
      folder.file(`${item.name}_frame_${String(i).padStart(2, '0')}.png`, blob);
    }
  } else {
    folder.file(`${item.name}.png`, dataUrlToBlob(item.cleanedImage));
  }

  return zip.generateAsync({ type: 'blob' });
}

// Export multiple selected assets as a ZIP with manifest.json
export async function exportMultipleAssetsZip(items: LibraryItem[]): Promise<Blob> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images')!;
  const manifest: any[] = [];

  for (const item of items) {
    const baseFilename = `${item.name}.png`;
    imgFolder.file(baseFilename, dataUrlToBlob(item.cleanedImage));

    const entry: any = {
      id: item.id,
      file: `images/${baseFilename}`,
      type: item.type,
      frameWidth: item.metadata.frameWidth,
      frameHeight: item.metadata.frameHeight,
      frames: item.metadata.frameCount || (item.frames ? item.frames.length : 1),
      fps: item.metadata.fps || 8,
      baselineY: item.metadata.baselineY || 0,
    };

    if (item.type === 'background') {
      entry.width = item.metadata.frameWidth;
      entry.height = item.metadata.frameHeight;
      entry.tiling = item.metadata.tiling ?? true;
      if (item.metadata.parallaxLayers && item.metadata.parallaxLayers.length > 0) {
        entry.layers = item.metadata.parallaxLayers.map((l, idx) => {
          const layerFile = `images/${item.name}_layer_${idx}_${l.name}.png`;
          imgFolder.file(layerFile, dataUrlToBlob(l.image));
          return {
            name: l.name,
            file: layerFile,
            speed: l.speed,
          };
        });
      }
    }

    // Also include individual animation frames if it's an animation
    if (item.type === 'animation' && item.frames && item.frames.length > 1) {
      entry.frameFiles = [];
      const frameFolder = zip.folder(`images/${item.name}_frames`)!;
      for (let f = 0; f < item.frames.length; f++) {
        const frameFilename = `${item.name}_f${f}.png`;
        frameFolder.file(frameFilename, dataUrlToBlob(item.frames[f]));
        entry.frameFiles.push(`images/${item.name}_frames/${frameFilename}`);
      }
    }

    manifest.push(entry);
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}
