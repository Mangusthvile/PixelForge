# PixelForge

Pixel art asset generator. You pick a style profile (palette, outline, reference images) and an asset type (sprite, animation sheet, props, background, effects). The server sends a prompt plus reference images to a Gemini image model. The browser then runs a deterministic canvas cleanup pipeline: magenta key-out, pixel snap / downscale, palette lock, stray pixel removal, and grid slicing into frames. Results are saved to a local library in IndexedDB.

## Run

```bash
npm install
# .env in the project root:
# GEMINI_API_KEY=your-key
npm run dev        # Express + Vite middleware on http://localhost:3000
npm run lint       # tsc --noEmit
npx tsx --test src/utils/pipeline.test.ts
```

## Layout

- `server.ts`: Express server. At startup it lists the Gemini models available to the key and keeps the image-output ones (`GET /api/models`), with a short fallback list if listing fails. `POST /api/generate` calls Gemini and returns the image plus `modelUsed`.
- `src/App.tsx`: app state, the generation flow, library auto-save, and the same-name dialog (Replace / Save as new version).
- `src/components/`: UI panels (`AssetConfigPanel`, `ProfilePanel`, `ResultsPanel`, `AnimationPreview`, `BackgroundPreview`, `LibraryDrawer`, `PixelEditorModal`, `AssetNameBar`, `Header`).
- `src/utils/pipeline.ts`: pure pixel operations (unit tested). `canvasPipeline.ts` runs them on canvases.
- `src/utils/gridLayout.ts`: grid template, pose notes, and copy detection. `promptBuilder.ts` builds prompts.
- `src/utils/storage.ts`: IndexedDB storage for library items and profiles, plus the built-in profile defaults.
- `src/utils/presets.ts`: animation, background, and prop presets. `naming.ts`: asset naming and versioning helpers.
- `public/assets/`: reference images for the built-in profiles.

## Rules

- The cleanup pipeline must stay deterministic: the same input image and settings must always produce the same output. Do not use randomness, model calls, or time-dependent logic in `pipeline.ts`, `canvasPipeline.ts`, or `gridLayout.ts`.
- Never put API keys in code or commits. The key comes only from `GEMINI_API_KEY` in `.env`, which git ignores.
- Library items and profiles are stored in IndexedDB only. localStorage is just for small settings like the selected model id. Do not store image data URLs in localStorage.
- Built-in profile defaults apply only when no saved profile with that id exists. Never overwrite a user's saved profile on load.
