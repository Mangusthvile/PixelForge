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
        'User-Agent': 'pixelforge-local',
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Image model discovery
// ---------------------------------------------------------------------------

interface ImageModelInfo {
  id: string;
  name: string;
  description?: string;
}

// Used only when the live models.list call fails (no key, network error, etc.).
const FALLBACK_IMAGE_MODELS: ImageModelInfo[] = [
  { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image (fallback)' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview (fallback)' },
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (fallback)' },
];

let imageModels: ImageModelInfo[] = FALLBACK_IMAGE_MODELS;
let defaultImageModel = FALLBACK_IMAGE_MODELS[0].id;
let modelsSource: 'api' | 'fallback' = 'fallback';
let modelsError: string | undefined;

function pickDefaultModel(models: ImageModelInfo[]): string {
  const pro3 = models.find((m) => m.id.startsWith('gemini-3-pro-image'));
  return (pro3 || models[0]).id;
}

/**
 * A model can produce images through generateContent if it advertises generateContent
 * and is an image-output Gemini model. The list API does not expose output modalities,
 * so we match on the "-image" id convention (e.g. gemini-3-pro-image-preview,
 * gemini-2.5-flash-image). Imagen models use a different API (predict) and are excluded.
 */
function isImageOutputModel(id: string, actions: string[] | undefined): boolean {
  if (!actions?.includes('generateContent')) return false;
  if (!id.startsWith('gemini')) return false;
  return /-image(-|$)/.test(id);
}

async function loadImageModels(): Promise<void> {
  const ai = getGeminiClient();
  if (!ai) {
    modelsError = 'GEMINI_API_KEY is not set.';
    console.warn(
      `[PixelForge] ${modelsError} Using fallback model list: ${FALLBACK_IMAGE_MODELS.map((m) => m.id).join(', ')}`
    );
    return;
  }

  try {
    const found: ImageModelInfo[] = [];
    const pager = await ai.models.list({ config: { pageSize: 200 } });
    for await (const m of pager) {
      const id = (m.name || '').replace(/^models\//, '');
      if (!id || !isImageOutputModel(id, m.supportedActions)) continue;
      found.push({ id, name: m.displayName || id, description: m.description });
    }

    if (found.length === 0) {
      throw new Error('models.list returned no image-capable models');
    }

    found.sort((a, b) => a.id.localeCompare(b.id));
    imageModels = found;
    defaultImageModel = pickDefaultModel(found);
    modelsSource = 'api';
    modelsError = undefined;
    console.log(
      `[PixelForge] Image models available: ${found.map((m) => m.id).join(', ')} (default: ${defaultImageModel})`
    );
  } catch (err: any) {
    modelsError = err?.message || String(err);
    imageModels = FALLBACK_IMAGE_MODELS;
    defaultImageModel = pickDefaultModel(FALLBACK_IMAGE_MODELS);
    modelsSource = 'fallback';
    console.warn(
      `[PixelForge] Listing models failed (${modelsError}). Using fallback model list: ${FALLBACK_IMAGE_MODELS.map((m) => m.id).join(', ')}`
    );
  }
}

// Models List Endpoint
app.get('/api/models', (_req: Request, res: Response) => {
  res.json({
    models: imageModels,
    defaultModel: defaultImageModel,
    source: modelsSource,
    error: modelsError,
  });
});

// Generation API endpoint
app.post('/api/generate', async (req: Request, res: Response) => {
  const {
    prompt,
    references = [],
    aspectRatio = '1:1',
    type = 'sprite',
    model,
    templateImage,
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const ai = getGeminiClient();

  if (!ai) {
    return res.status(400).json({
      error: 'GEMINI_API_KEY is not set. Add it to the .env file in the project root and restart the server.',
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

    // Use the requested model, or the discovered default (Gemini 3 Pro Image when available)
    const targetModel: string = model || defaultImageModel;
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
      // Report the model that actually served the request when the API tells us.
      modelUsed: response.modelVersion || targetModel,
      modelRequested: targetModel,
    });
  } catch (error: any) {
    console.error(`Error generating image via Gemini API (model: ${model || defaultImageModel}):`, error);
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
  await loadImageModels();

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
