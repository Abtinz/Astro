# scroll-landing Structure and Architecture

This file documents how the `scroll-landing` app is organized and how it works internally.

## 1) Purpose

`scroll-landing` is the public marketing/entry experience for Astro Suite.

It provides:
- Scroll-scrubbed cinematic background video
- Layered visual effects (vignette + particles + grain)
- Staggered reveal cards and CTA
- Route handoff to the main app via `/app`

## 2) Tech Stack

- Vite
- TypeScript (vanilla, no framework)
- CSS (single stylesheet)

## 3) Directory Structure

```text
scroll-landing/
├── index.html
├── src/
│   ├── main.ts
│   └── style.css
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

## 4) File Responsibilities

### `index.html`
- Declares all fixed rendering layers:
  - `#video-canvas` (main visual layer)
  - `#vignette` (cinematic darkening)
  - `#particles` (floating particles)
  - `#source-video` (hidden video input)
- Defines scroll content panels (`.panel`) and CTA section.
- Loads Google fonts and mounts `src/main.ts`.

### `src/main.ts`
Main runtime engine. It handles:
- Canvas setup and resize logic with capped DPR.
- Frame extraction from video into `ImageBitmap[]` for smooth scrubbing.
- Scroll tracking (`scrollFraction`) + smoothing (`smoothScroll`).
- Frame rendering (cover-crop fit to viewport).
- Particle simulation and rendering.
- Parallax updates for visible panels.
- IntersectionObserver-based reveal animations.
- Loader lifecycle and progress bar updates.

### `src/style.css`
Complete visual system and animation rules:
- Theme tokens in `:root` (gold/noir palette, typography, easing).
- Layer styling (`#video-canvas`, `#particles`, `#vignette`).
- Glassmorphic panel cards and reveal/stagger animation.
- CTA button micro-interactions.
- Film grain overlay.
- Responsive adaptations (`768px`, `480px`) and reduced motion support.

### `vite.config.ts`
- Runs dev server on port `5173`.
- `publicDir: 'public'` for static assets.
- Allows parent directory access in dev server FS config.

### `vercel.json`
Production rewrites for app handoff:
- `/app` and `/app/:path*` are rewritten to the deployed app endpoint.
- This keeps landing and app under one UX entry path.

### `tsconfig.json`
- Strict TypeScript settings.
- Bundler-mode module resolution.
- No emit (Vite handles bundling).
- Includes only `src`.

### `package.json`
Scripts:
- `npm run dev`
- `npm run build`
- `npm run preview`

Dev dependencies:
- `typescript`
- `vite`

## 5) Runtime Flow

```text
Page load
  -> canvases sized to viewport
  -> render loop starts immediately
  -> hidden video begins loading
  -> frames extracted in background (ImageBitmap cache)
  -> loader hides once extraction completes

User scrolls
  -> scroll position mapped to normalized fraction
  -> smoothed fraction computed via adaptive lerp
  -> frame index selected and drawn to video canvas
  -> progress bar updated
  -> particles drift (partly influenced by scroll velocity)
  -> visible cards get subtle parallax transform
```

## 6) Layering Model (z-index)

Front to back:
1. `#loader` (temporary top overlay)
2. `#progress-bar`
3. Scroll content cards (`#scroll-container`)
4. `#particles`
5. `#vignette`
6. `#video-canvas`
7. Page background

This ordering is what creates the cinematic composition.

## 7) Performance Characteristics

- Uses pre-extracted bitmaps (`FRAME_COUNT = 180`) for responsive scrubbing.
- Falls back to direct `video.currentTime` seeking if frames are not ready.
- Caps DPR to `2` to limit canvas cost on high-density displays.
- Uses `requestAnimationFrame` for synchronized updates.
- Uses IntersectionObserver instead of heavy scroll listeners for reveal state.

## 8) Operational Notes

- The hidden source video is expected at `/astro-demo.mp4`.
- Main app route is expected at `/app` (and proxied in production by Vercel rewrites).
- If scroll effects break, first inspect `src/main.ts` (logic) and `src/style.css` (layer/animation assumptions).
