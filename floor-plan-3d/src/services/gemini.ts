import { GoogleGenAI } from '@google/genai';
import { extractHtmlFromText } from '../utils/html';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const FAST_MODEL = 'gemini-2.5-flash';

const RENDER_PROMPT = `Transform this 2D architectural floor plan into a 3D rendered visualization.
Match the style, perspective, and level of detail shown in the reference image.
Include realistic furniture, textures, materials, and lighting.
Maintain the exact room layout, dimensions, and labels from the original floor plan.
Use an isometric or slightly elevated perspective.
DOORS ARE MANDATORY: every doorway shown in the floor plan must be clearly represented in the 3D render (visible opening and/or visible door leaf). Do not omit any door.
STAIR/CEILING CLEARANCE: if stairs exist, keep stair flight natural and buildable. Do not let stairs intersect the ceiling; preserve headroom and align stairs with their opening/void.

The first image is the floor plan to transform.
The second image is the style reference to match.`;

const VOXEL_PROMPT = `I have provided a 3D rendered floor plan image.
Code a beautiful voxel art scene that accurately represents this floor plan layout.
Write Three.js code as a single-page HTML file.
Use browser-safe script tags (NON-module): do not use \`type="module"\` and do not use ES import statements.
Use global scripts compatible with downloaded HTML files:
- https://unpkg.com/three@0.160.0/build/three.min.js
- https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js
Expose globals explicitly:
- window.scene
- window.camera
- window.renderer
- window.controls

CRITICAL REQUIREMENTS — pay close attention to these:
- WALLS: Every wall must be clearly visible as a solid 3D structure with proper height and thickness. Walls should form complete enclosures for each room. Do not skip any walls — trace every wall boundary from the floor plan precisely.
- DOORS: Represent each door as a visible opening/gap in the wall with a door frame. Doors must be placed at the exact positions shown in the image. Use a different color or a thin rectangular panel to show the door.
- STAIRS: If stairs are visible in the image, include them as a series of stacked box steps rising in height. Do NOT omit stairs. IMPORTANT: Each stair step must be at a UNIQUE Y position with NO overlapping faces between steps. Leave a tiny gap (0.05 units) between each step to prevent z-fighting/flashing.
- STAIR HEADROOM: stairs must not clip into/through ceiling slabs. Keep a visible clearance zone above the steps. If needed, lower the stair run or create a stair void so stairs remain natural and unobstructed.
- Include all rooms, furniture, and architectural features visible in the image.
- Each room should be distinguishable by its walls and door placements.

Make it interactive with OrbitControls for mouse rotation/zoom AND WASD keyboard controls for first-person movement:
- W: move camera forward
- A: move camera left
- S: move camera backward
- D: move camera right
- Q: move camera down
- E: move camera up
The WASD movement should translate the camera and orbit target together so the user can walk through the scene.`;

const FIX_VOXEL_PROMPT = `I have provided an image of a 3D rendered floor plan, along with the HTML (Three.js) code that was generated to represent it.
Your task is to carefully review the provided image and code, checking for any mistakes or missing elements.
Specifically, look for and fix the following issues:
1. Missing walls, doors or features that are present in the image but not in the code.
2. Intersecting objects (e.g. stairs clipping through the ceiling or walls).
3. Incorrect dimensions or proportions.
4. Z-fighting or flickering textures (ensure tiny gaps exist between overlapping coplanar faces).
5. Floating objects or misaligned elements.
6. Browser incompatibility for downloaded files.

IMPORTANT OUTPUT REQUIREMENTS:
- Output complete HTML only.
- Use NON-module script tags, no ES module imports.
- Ensure \`window.scene\`, \`window.camera\`, \`window.renderer\`, and \`window.controls\` are assigned.

Fix the code and output the complete, corrected single-page HTML file (with Three.js code inside). Ensure the final code satisfies all requirements of a beautifully rendered 3D voxel scene.`;

const extractThinkingHeader = (buffer: string): string | null => {
  const matches = buffer.match(/\*\*([^*]+)\*\*/g);
  if (!matches?.length) return null;
  return matches[matches.length - 1].replace(/\*\*/g, '').trim();
};

const runPlanningAgent = async (
  imageBase64: string,
  prompt: string
): Promise<string> => {
  const data = imageBase64.split(',')[1] || imageBase64;
  const mime = imageBase64.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';

  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mime,
            data,
          },
        },
        { text: prompt },
      ],
    },
  });
  return response.text?.trim() || '';
};

/**
 * Sends the customer's floor plan + style reference to Gemini Flash
 * and returns a 3D-rendered image as a base64 data URL.
 */
export const generateFloorPlanRender = async (
  floorPlanBase64: string,
  styleReferenceBase64: string
): Promise<string> => {
  const floorPlanData = floorPlanBase64.split(',')[1] || floorPlanBase64;
  const floorPlanMime = floorPlanBase64.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';

  const styleData = styleReferenceBase64.split(',')[1] || styleReferenceBase64;
  const styleMime = styleReferenceBase64.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';

  const response = await ai.models.generateContent({
    model: 'nano-banana-pro-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: floorPlanMime,
            data: floorPlanData,
          },
        },
        {
          inlineData: {
            mimeType: styleMime,
            data: styleData,
          },
        },
        {
          text: RENDER_PROMPT,
        },
      ],
    },
    config: {
      responseModalities: ['IMAGE'],
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (part && part.inlineData) {
    const base64ImageBytes = part.inlineData.data;
    const mimeType = part.inlineData.mimeType || 'image/png';
    return `data:${mimeType};base64,${base64ImageBytes}`;
  }
  throw new Error('No image generated. Gemini returned an empty response.');
};

/**
 * Agentic render pipeline (planner + renderer) under the same UI button.
 */
export const generateFloorPlanRenderAgentic = async (
  floorPlanBase64: string,
  styleReferenceBase64: string,
  onAgentUpdate?: (message: string) => void
): Promise<string> => {
  onAgentUpdate?.('Agent Planner: analyzing floor plan and style...');

  const plannerNotes = await runPlanningAgent(
    floorPlanBase64,
    `You are a planner sub-agent for floor-plan rendering.
Return 5 short bullet points only, focused on:
- mandatory door visibility
- wall integrity
- stair naturality and ceiling clearance
- furniture/material realism
- camera perspective consistency`
  );

  const floorPlanData = floorPlanBase64.split(',')[1] || floorPlanBase64;
  const floorPlanMime = floorPlanBase64.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';
  const styleData = styleReferenceBase64.split(',')[1] || styleReferenceBase64;
  const styleMime = styleReferenceBase64.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';

  onAgentUpdate?.('Agent Renderer: generating 3D render...');

  const response = await ai.models.generateContent({
    model: 'nano-banana-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: floorPlanMime, data: floorPlanData } },
        { inlineData: { mimeType: styleMime, data: styleData } },
        { text: `${RENDER_PROMPT}\n\nPlanner notes:\n${plannerNotes}` },
      ],
    },
    config: {
      responseModalities: ['IMAGE'],
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (part && part.inlineData) {
    const base64ImageBytes = part.inlineData.data;
    const mimeType = part.inlineData.mimeType || 'image/png';
    return `data:${mimeType};base64,${base64ImageBytes}`;
  }

  throw new Error('No image generated. Agent renderer returned an empty response.');
};

/**
 * Sends a 3D rendered image to Gemini Pro and streams back Three.js voxel code.
 * Calls onThoughtUpdate with thinking fragments as they arrive.
 */
export const generateVoxelScene = async (
  imageBase64: string,
  onThoughtUpdate?: (thought: string) => void
): Promise<string> => {
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeMatch = imageBase64.match(/^data:(.*?);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  let fullHtml = '';

  const response = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        {
          text: VOXEL_PROMPT,
        },
      ],
    },
    config: {
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });

  for await (const chunk of response) {
    const candidates = chunk.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        const p = part as any;
        if (p.thought) {
          if (onThoughtUpdate && p.text) {
            onThoughtUpdate(p.text);
          }
        } else if (p.text) {
          fullHtml += p.text;
        }
      }
    }
  }

  return extractHtmlFromText(fullHtml);
};

/**
 * Sends a generated Three.js HTML scene back to Gemini Pro along with the reference image,
 * asking it to diagnose errors and fix the code. Streams thought updates.
 */
export const fixVoxelScene = async (
  imageBase64: string,
  generatedHtml: string,
  onThoughtUpdate?: (thought: string) => void
): Promise<string> => {
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeMatch = imageBase64.match(/^data:(.*?);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  let fullHtml = '';

  const response = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        {
          text: FIX_VOXEL_PROMPT,
        },
        {
          text: `Here is the currently generated code to fix:\n` + generatedHtml,
        },
      ],
    },
    config: {
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });

  for await (const chunk of response) {
    const candidates = chunk.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        const p = part as any;
        if (p.thought) {
          if (onThoughtUpdate && p.text) {
            onThoughtUpdate(p.text);
          }
        } else if (p.text) {
          fullHtml += p.text;
        }
      }
    }
  }

  return extractHtmlFromText(fullHtml);
};

/**
 * Agentic voxel pipeline (planner + builder + reviewer) under the same UI button.
 */
export const generateVoxelSceneAgentic = async (
  imageBase64: string,
  onAgentUpdate?: (message: string) => void,
  onThoughtUpdate?: (thought: string) => void
): Promise<string> => {
  onAgentUpdate?.('Agent Planner: mapping walls, doors, and stairs...');

  const plannerNotes = await runPlanningAgent(
    imageBase64,
    `You are a planner sub-agent for voxel generation.
Return 6 short bullets only:
- wall tracing priorities
- exact door opening placements
- stair run and headroom constraints
- anti z-fighting advice
- camera/navigation constraints
- common failure points to avoid`
  );

  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeType = imageBase64.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';

  onAgentUpdate?.('Agent Builder: generating initial 3D scene...');

  let fullHtml = '';
  let thoughtBuffer = '';
  const buildResponse = await ai.models.generateContentStream({
    model: FAST_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: `${VOXEL_PROMPT}\n\nPlanner notes:\n${plannerNotes}` },
      ],
    },
    config: {
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });

  for await (const chunk of buildResponse) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      const p = part as any;
      if (p.thought && p.text) {
        thoughtBuffer += p.text;
        const header = extractThinkingHeader(thoughtBuffer);
        if (header) onThoughtUpdate?.(header);
      } else if (p.text) {
        fullHtml += p.text;
      }
    }
  }

  const firstPassHtml = extractHtmlFromText(fullHtml);
  onAgentUpdate?.('Agent Reviewer: validating and fixing scene...');

  let fixedHtmlRaw = '';
  let fixThoughtBuffer = '';
  const reviewResponse = await ai.models.generateContentStream({
    model: FAST_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: FIX_VOXEL_PROMPT },
        { text: `Planner notes:\n${plannerNotes}` },
        { text: `Here is the currently generated code to fix:\n${firstPassHtml}` },
      ],
    },
    config: {
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });

  for await (const chunk of reviewResponse) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      const p = part as any;
      if (p.thought && p.text) {
        fixThoughtBuffer += p.text;
        const header = extractThinkingHeader(fixThoughtBuffer);
        if (header) onThoughtUpdate?.(header);
      } else if (p.text) {
        fixedHtmlRaw += p.text;
      }
    }
  }

  return extractHtmlFromText(fixedHtmlRaw);
};
