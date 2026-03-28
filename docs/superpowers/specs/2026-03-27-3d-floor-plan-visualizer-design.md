# 3D Floor Plan Visualizer — Design Spec

## Overview

A self-service web app where customers upload a 2D architectural floor plan and receive an interactive 3D visualization. The app uses Google Gemini to first transform the floor plan into a 3D-rendered image (matching a predefined style reference), then converts that render into an explorable Three.js voxel scene.

## User Flow

### Step 1: Upload
- Customer drags & drops (or clicks to browse) their 2D floor plan image
- Supported formats: PNG, JPG, WEBP, HEIC, HEIF
- The uploaded image is displayed in the viewer area
- A step indicator shows progress (Step 1 of 3 active)

### Step 2: Generate 3D Render
- Customer clicks "Generate 3D Render"
- The app sends two images to Gemini 2.5 Flash Image Generation:
  - The customer's floor plan
  - The bundled style reference image (`NanoBanana_General_Sample.jpg`)
- Prompt instructs Gemini to transform the 2D floor plan into a 3D rendered visualization matching the style reference (isometric view with furniture, textures, depth, and realistic materials)
- A loading overlay shows progress with thinking animation
- The resulting 3D-rendered image is displayed to the customer
- Customer can download this image or proceed to Step 3

### Step 3: Generate 3D Voxel Scene
- Customer clicks "Generate 3D Scene"
- The 3D-rendered image from Step 2 is sent to Gemini 3 Pro with streaming
- Gemini generates Three.js code as a single-page HTML file representing the floor plan as voxel art
- Streaming thought updates are shown during generation
- The resulting HTML is rendered in a sandboxed iframe
- Customer can interact with the 3D scene (rotate, zoom, pan) and download it as an HTML file

## UI Design

### Layout
Single-page app with vertical layout:
1. **Header** — App title and subtitle
2. **Step Indicator** — Three-step stepper showing Upload → 3D Render → 3D Scene
3. **Viewer Area** — Large display area (4:3 aspect ratio) that serves as:
   - Drop zone (Step 1)
   - Image display (Steps 1-2)
   - Voxel scene iframe (Step 3)
   - Loading overlay (during generation)
4. **Action Buttons** — Contextual buttons that unlock progressively:
   - "Generate 3D Render" (available after upload)
   - "Generate 3D Scene" (available after 3D render)
   - "Download" (available when there's content to download)
   - View toggle (switch between original plan, 3D render, voxel scene)
   - "Start Over" (reset to Step 1)

### States
- **Idle** — Waiting for user action
- **Generating Render** — Gemini Flash processing, loading overlay visible
- **Generating Voxels** — Gemini Pro streaming, loading overlay with thought text
- **Error** — Error message displayed, retry available

## Technical Architecture

### Project Structure

```
floor-plan-3d/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.local                  # GEMINI_API_KEY
├── src/
│   ├── main.tsx                # Entry point, renders App
│   ├── App.tsx                 # Main component, state management, step logic
│   ├── App.css                 # All styles (clean CSS, no Tailwind)
│   ├── components/
│   │   ├── Stepper.tsx         # Step indicator (1-2-3) with active/completed states
│   │   ├── UploadZone.tsx      # Drag & drop file upload with preview
│   │   ├── Viewer.tsx          # Displays image or voxel iframe
│   │   └── LoadingOverlay.tsx  # Thinking animation with status text
│   ├── services/
│   │   └── gemini.ts           # Gemini API: render generation + voxel generation
│   ├── utils/
│   │   └── html.ts             # HTML extraction, cleanup, camera zoom helpers
│   └── assets/
│       └── sample-style.jpg    # NanoBanana style reference (bundled)
```

### Dependencies

```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@google/genai": "^1.27.0"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

### Gemini Service (`services/gemini.ts`)

Two API functions:

#### `generateFloorPlanRender(floorPlanBase64: string, styleReferenceBase64: string): Promise<string>`
- **Model:** `gemini-2.5-flash-image`
- **Input:** Two images as inline base64 data — the customer's floor plan and the bundled style reference
- **Prompt:** "Transform this 2D architectural floor plan into a 3D rendered visualization. Match the style, perspective, and level of detail shown in the reference image. Include realistic furniture, textures, materials, and lighting. Maintain the exact room layout, dimensions, and labels from the original floor plan. Use an isometric or slightly elevated perspective."
- **Config:** `responseModalities: ['IMAGE']`
- **Returns:** Base64 data URL of the generated 3D render

#### `generateVoxelScene(imageBase64: string, onThoughtUpdate?: (thought: string) => void): Promise<string>`
- **Model:** `gemini-3-pro-preview`
- **Input:** The 3D rendered image from the previous step
- **Prompt:** "I have provided a 3D rendered floor plan image. Code a beautiful voxel art scene that accurately represents this floor plan layout. Write Three.js code as a single-page HTML file. Include all rooms, walls, furniture, and architectural features visible in the image. Make it interactive with orbit controls."
- **Config:** `thinkingConfig: { includeThoughts: true }` for streaming
- **Returns:** Extracted HTML string (cleaned and camera-zoomed)
- **Borrowed from:** Existing `image-to-voxel-art/services/gemini.ts` with adapted prompt

### Utils (`utils/html.ts`)

Borrowed directly from the existing project:
- `extractHtmlFromText(text)` — Extracts HTML from markdown code blocks in Gemini response
- `hideBodyText(html)` — Removes text nodes from body to clean up the scene
- `zoomCamera(html)` — Adjusts Three.js camera position for better default view

### Components

#### `App.tsx`
- Manages all state: current step, uploaded image, rendered image, voxel code, status, errors
- Loads the bundled style reference image on mount (converts to base64)
- Orchestrates the generation pipeline
- Renders Stepper, UploadZone/Viewer, LoadingOverlay, and action buttons

#### `Stepper.tsx`
- Props: `currentStep: 1 | 2 | 3`
- Renders three steps with labels: Upload, 3D Render, 3D Scene
- Visual states: completed (checkmark), active (highlighted), pending (grayed)

#### `UploadZone.tsx`
- Props: `onFileSelect: (base64: string) => void`, `disabled: boolean`
- Drag & drop zone with click-to-browse fallback
- File type validation (PNG, JPG, WEBP, HEIC, HEIF)
- Reads file as base64 data URL via FileReader

#### `Viewer.tsx`
- Props: `mode: 'empty' | 'image' | 'voxel'`, `imageSrc?: string`, `voxelCode?: string`
- Empty mode: shows placeholder text
- Image mode: renders `<img>` tag
- Voxel mode: renders sandboxed `<iframe>` with `srcDoc`

#### `LoadingOverlay.tsx`
- Props: `status: string`, `thinkingText?: string`
- Full-overlay with status message and animated dots
- Shows streaming thought text when available

### Style Reference Handling

The `NanoBanana_General_Sample.jpg` is copied into `src/assets/sample-style.jpg` and imported as a static asset. On app mount, it's fetched and converted to base64 so it can be sent to Gemini alongside the customer's floor plan. This ensures every customer gets a consistent 3D rendering style.

### Environment

- `GEMINI_API_KEY` stored in `.env.local` (gitignored)
- Vite exposes it via `process.env.API_KEY` (same pattern as existing project)

## Error Handling

- File type validation on upload (reject unsupported formats)
- Gemini API errors displayed in an error banner with option to retry
- Network errors caught and displayed
- Empty response from Gemini handled ("No image generated" / "No code generated")

## What This Does NOT Include

- User authentication or accounts
- Server-side processing (all Gemini calls happen client-side)
- Multiple floor support (single floor plan per session)
- Floor plan editing or annotation
- Saving/sharing results (download only)
