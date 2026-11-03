# PixelForge

Style-locked pixel art asset generator (sprites, animation sheets, props, backgrounds, effects) using Gemini image models plus a deterministic in-browser cleanup pipeline.

## Local setup

Requirements: Node.js 20+.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your Gemini API key:

   ```
   GEMINI_API_KEY=your-key-here
   ```

   `.env` is git-ignored. Never commit your key.

3. Start the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. At startup the server log lists the image models your key can use. The app defaults to Gemini 3 Pro Image when it is available.

## Checks

```bash
npm run lint
npx tsx --test src/utils/pipeline.test.ts
```

## Storage

Generated assets and style profiles are stored in your browser's IndexedDB, so they stay in the browser you used. To move them elsewhere, use **Export Manifest** to download the library as a ZIP.
