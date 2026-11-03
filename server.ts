import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to initialize GoogleGenAI safely
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Available Image Generation Models
const AVAILABLE_MODELS = [
  {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro Image',
    badge: 'Pro Quality (Default)',
    description: 'Highest visual fidelity, exact adherence to pixel art references and proportions',
    isDefault: true,
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Gemini Nano Banana 2.1',
    badge: 'High-Res / 2K',
    description: 'High-quality generation with expanded aspect ratio support and crisp edges',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Gemini 3.1 Flash Lite Image',
    badge: 'Fast Lite',
    description: 'High throughput, fast draft generations and rapid iteration',
  },
];

// Models List Endpoint
app.get('/api/models', (_req: Request, res: Response) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaultModel: 'gemini-3-pro-image',
  });
});

// Generation API endpoint
app.post('/api/generate', async (req: Request, res: Response) => {
  const {
    prompt,
    references = [],
    aspectRatio = '1:1',
    type = 'sprite',
    model = 'gemini-3-pro-image',
    templateImage,
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const ai = getGeminiClient();

  if (!ai) {
    return res.status(400).json({
      error: 'GEMINI_API_KEY is not configured in your environment or Secrets panel.',
      needsApiKey: true,
    });
  }

  try {
    const parts: any[] = [];

    // 1. If Template Image is provided (Template Fill Mode), it MUST be the primary image to edit
    if (templateImage) {
      parts.push({
        inlineData: {
          data: templateImage.replace(/^data:[^;]+;base64,/, ''),
          mimeType: 'image/png',
        },
      });
    }

    // 2. Attach reference images (Anchor reference is guaranteed first in the array from frontend)
    if (Array.isArray(references) && references.length > 0) {
      for (const ref of references) {
        if (ref.data) {
          parts.push({
            inlineData: {
              data: ref.data.replace(/^data:[^;]+;base64,/, ''),
              mimeType: ref.mimeType || 'image/png',
            },
          });
        }
      }
    }

    // 3. Attach prompt text
    parts.push({
      text: prompt,
    });

    // Pick target model, default to highest quality gemini-3-pro-image
    const targetModel = model || 'gemini-3-pro-image';
    console.log(`[PixelForge API] /api/generate invoking Gemini model: ${targetModel} (aspectRatio: ${aspectRatio})`);

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: {
        parts,
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
        },
      },
    });

    let foundImage = false;
    let imageDataUrl = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        foundImage = true;
        break;
      }
    }

    if (!foundImage) {
      const textOutput = response.text || 'No image data returned from model.';
      return res.status(500).json({
        error: `Model returned text instead of image: ${textOutput}`,
      });
    }

    return res.json({
      success: true,
      image: imageDataUrl,
      modelUsed: targetModel,
    });
  } catch (error: any) {
    console.error('Error generating image via Gemini API:', error);
    const errorMessage = error?.message || 'Failed to generate image via Gemini API.';
    const isPaidKeyError =
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('paid tier');
    const isAuthError =
      errorMessage.includes('API_KEY_INVALID') ||
      errorMessage.includes('PERMISSION_DENIED');

    return res.status(500).json({
      error: errorMessage,
      isPaidKeyError,
      isAuthError,
      details: error?.toString(),
    });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Vite middleware in dev
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PixelForge server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
