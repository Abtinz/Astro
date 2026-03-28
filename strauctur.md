# Project Structure and Architecture

This document explains the current repository layout, what each part does, and how the system works end-to-end.

## 1) High-level Repository Map

```text
.
├── README.md
├── start-dev.sh
├── astro-demo.mp4
├── MapImage.jpg
├── NanoBanana_General_Sample.jpg
├── docs/
│   ├── screenshots/
│   └── superpowers/
│       ├── plans/
│       └── specs/
├── scroll-landing/                  # Public landing page (Vite + TypeScript)
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   └── style.css
│   ├── vercel.json
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── Astro/
│   ├── floor-plan-3d/               # Main app (Vite + React + TypeScript)
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── App.css
│   │   │   ├── assets/sample-style.jpg
│   │   │   ├── components/
│   │   │   │   ├── UploadZone.tsx
│   │   │   │   ├── Stepper.tsx
│   │   │   │   ├── Viewer.tsx
│   │   │   │   └── LoadingOverlay.tsx
│   │   │   ├── services/gemini.ts
│   │   │   └── utils/html.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   ├── docs/superpowers/            # Duplicate planning docs snapshot
│   ├── MapImage.jpg                 # Duplicate sample image
│   └── NanoBanana_General_Sample.jpg# Duplicate sample image
└── floor-plan-3d/                   # Build/dependency artifact folder (not source app)
    ├── .env.local
    ├── dist/
    └── node_modules/
```

## 2) Which folders are "active" vs "duplicate/artifact"

### Active source of truth
- `scroll-landing/` is the landing experience codebase.
- `Astro/floor-plan-3d/` is the React app codebase for generation and 3D viewing.
- Root `docs/` is the primary documentation/screenshots location.

### Duplicate or artifact paths to be aware of
- `Astro/docs/...` duplicates `docs/...` planning/spec files.
- `Astro/MapImage.jpg` and `Astro/NanoBanana_General_Sample.jpg` duplicate the same images in root.
- Root-level `floor-plan-3d/` currently contains build/runtime artifacts (`dist`, `node_modules`, `.env.local`) and is not the main source app.

## 3) System Architecture

## 3.1 Frontend surfaces

### A) Landing app (`scroll-landing`)
- Stack: Vite + vanilla TypeScript + CSS.
- Purpose: cinematic, scroll-driven marketing page.
- Core file: `scroll-landing/src/main.ts`.
  - Pre-extracts video frames from `astro-demo.mp4` into bitmaps.
  - Uses a canvas render loop to scrub video frames by scroll position.
  - Adds particle effects, parallax panel motion, and reveal animations.
- Deployment routing: `scroll-landing/vercel.json` rewrites `/app` to the deployed app URL.

### B) Main app (`Astro/floor-plan-3d`)
- Stack: React 19 + TypeScript + Vite.
- Entry: `src/main.tsx` renders `App`.
- `App.tsx` acts as the orchestration/state-machine layer.
  - Status states: `idle`, render generation, wall extraction, base scene generation, furniture generation, validation, `error`.
  - View modes: `upload`, `render`, `voxel`.
  - Controls the full user workflow and all action buttons.

## 3.2 AI pipeline layer

Implemented in `src/services/gemini.ts` using `@google/genai`.

Pipeline stages:
1. `generateFloorPlanRender(...)`
   - Input: uploaded floor plan + bundled style reference image.
   - Output: generated rendered image (base64 data URL).
2. `extractWallJSON(...)`
   - Input: rendered image.
   - Output: architecture JSON (rooms/walls/doors/stairs).
3. `generateBaseScene(...)`
   - Input: rendered image + wall JSON.
   - Output: HTML/Three.js base shell scene.
4. `generateFurnitureScene(...)`
   - Input: rendered image + base scene HTML.
   - Output: furnished HTML/Three.js scene.
5. `fixVoxelScene(...)`
   - Input: rendered image + generated scene HTML.
   - Output: corrected final HTML scene.

Environment handling:
- `vite.config.ts` injects `GEMINI_API_KEY` into `process.env.API_KEY` for client-side use.
- This means the key is used in frontend runtime (important security consideration for production).

## 3.3 Scene post-processing layer

`src/utils/html.ts` post-processes model-generated HTML before display/download:
- `extractHtmlFromText` / `extractJsonFromText`: robust parsing from model responses.
- `hideBodyText`: removes overlays/instruction text from generated scenes.
- `zoomCamera`: adjusts initial camera position.
- `injectWASDControls`: adds keyboard navigation.
- `injectCityEnvironment`: adds city/ground/lighting context.
- `fixZFighting`: patches depth and geometry overlap issues.

The final transformed HTML is:
`hideBodyText -> zoomCamera -> injectWASDControls -> injectCityEnvironment -> fixZFighting`

## 3.4 UI component responsibilities

Inside `Astro/floor-plan-3d/src/components`:
- `UploadZone.tsx`: file selection + drag/drop + MIME validation.
- `Stepper.tsx`: 3-step progress indicator.
- `Viewer.tsx`: switches between empty state, image preview, and sandboxed iframe for HTML scene.
- `LoadingOverlay.tsx`: phase status, pseudo-progress, and streamed "thinking" header display.

## 4) Runtime Data Flow

```text
User uploads floor plan image
  -> UploadZone reads file as base64
  -> App state stores uploaded image
  -> Generate Render
    -> Gemini image model returns photorealistic render
  -> Generate 3D Scene
    -> Gemini extracts wall JSON
    -> Gemini generates base shell HTML
    -> Gemini adds furniture
    -> Gemini validates/fixes scene
  -> html.ts post-processing transforms final HTML
  -> Viewer renders final HTML in sandboxed iframe
  -> User can download render image or scene HTML
```

## 5) Dev and Deployment Model

Local development:
- `start-dev.sh` starts both apps in parallel.
- Landing: `http://localhost:5173`
- App: `http://localhost:3001`

Deployment model:
- Landing deploy serves marketing site.
- `/app` route rewrites/proxies to the app deployment.
- App deploy expects `GEMINI_API_KEY` in environment variables.

## 6) Quick Orientation Checklist (for new contributors)

1. Read `README.md` for overall intent and commands.
2. If editing marketing UX, work in `scroll-landing/`.
3. If editing generation pipeline or 3D app UX, work in `Astro/floor-plan-3d/`.
4. For AI behavior changes, start in `src/services/gemini.ts`.
5. For generated scene behavior/quality fixes, start in `src/utils/html.ts`.
6. Treat root `floor-plan-3d/` as artifact output, not primary source.
