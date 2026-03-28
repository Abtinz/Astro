import { GoogleGenAI } from '@google/genai';
import { extractHtmlFromText, extractJsonFromText } from '../utils/html';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }
  return _ai;
}
const ai = new Proxy({} as GoogleGenAI, {
  get(_, prop) {
    return (getAI() as any)[prop];
  },
});

const RENDER_PROMPT = `Transform this 2D architectural floor plan into a 3D rendered visualization.
Match the style, perspective, and level of detail shown in the reference image.
Include realistic furniture, textures, materials, and lighting.
Maintain the exact room layout, dimensions, and labels from the original floor plan.
Use an isometric or slightly elevated perspective.
DOORS ARE MANDATORY: every doorway shown in the floor plan must be clearly represented in the 3D render (visible opening and/or visible door leaf). Do not omit any door.
STAIR/CEILING CLEARANCE: if stairs exist, keep stair flight natural and buildable. Do not let stairs intersect the ceiling; preserve headroom and align stairs with their opening/void.

The first image is the floor plan to transform.
The second image is the style reference to match.`;

const EXTRACT_WALLS_PROMPT = `I have provided an image of a 3D rendered floor plan.
Your task is to carefully analyze the structural elements (walls, doors, stairs, floors, rooms) and output a clean JSON structure representing their coordinates, dimensions, and types.
Focus ONLY on the architectural shell. Ignore all furniture, lighting, appliances, and decorative items.

Output a valid JSON object matching this general structure:
{
  "rooms": [
    { "name": "Living Room", "bounds": { "x": 0, "z": 0, "width": 10, "depth": 10 } }
  ],
  "walls": [
    { "x": 0, "z": 0, "width": 10, "height": 2.5, "depth": 0.2, "orientation": "horizontal" }
  ],
  "doors": [
    { "x": 2, "z": 0, "width": 1, "height": 2.2, "depth": 0.2, "orientation": "horizontal" }
  ],
  "stairs": [
    { "x": 8, "z": 8, "steps": 10, "width": 1.2, "rise": 0.2, "run": 0.3 }
  ]
}
Make the coordinates approximate but proportional to the visual layout. Ensure walls enclose all of the individual rooms.
IMPORTANT: Wall height must be realistic residential scale (2.4 to 2.6 units). Do NOT make walls taller than 3 units.`;

const BASE_SCENE_PROMPT = `I have provided a 3D rendered floor plan image and a JSON map of its core architectural layout (walls, doors, rooms, stairs).
Code a beautiful voxel art scene representing ONLY the base architectural shell of this floor plan.
DO NOT add any furniture, appliances, or decorative items yet. We will add those in a later pass.

Write Three.js code as a single-page HTML file.

CRITICAL REQUIREMENTS:
- Use the provided JSON map as a guide for coordinates, but adjust visually to match the provided image perfectly.
- WALLS: Every wall must be clearly visible as a solid 3D structure. Wall height MUST be realistic residential scale: 2.4 to 2.6 units tall (NOT taller). Wall thickness should be 0.2 units.
- DOORS: Represent each door as a visible opening/gap in the wall.
- STAIRS: If stairs are present, build them as stacked box steps.
- FLOOR: Add a distinct floor color or texture to outline the rooms.

Make it interactive with OrbitControls for mouse rotation/zoom AND WASD keyboard controls (W/A/S/D to translate, Q/E for vertical).`;

const FURNITURE_PROMPT = `I have provided an image of a 3D rendered floor plan, and the HTML/Three.js code of the base architectural shell (walls and floors) that we just built.
Your task is to populate this base shell with all the furniture, cabinets, appliances, and distinctive details visible in the original image.

CRITICAL REQUIREMENTS:
- DO NOT remove or break any of the existing walls, doors, or floors. Add to the existing scene.
- For each room, add blocky/voxel-style representations of the major furniture items (e.g., beds, sofas, tables, kitchen counters, bathtubs).
- Place items at the correct relative positions.
- Use basic Three.js geometries (boxes, cylinders) and distinct colored materials for the furniture.
- Fix any intersecting geometries (e.g., furniture clipping through walls).

Return the ENTIRE updated, complete single-page HTML file including the new furniture code, retaining the OrbitControls and WASD controls script.`;

const FIX_VOXEL_PROMPT = `I have provided an image of a 3D rendered floor plan, along with the HTML (Three.js) code that was generated to represent it.
Your task is to carefully review the provided image and code, checking for any mistakes or missing elements.
Specifically, look for and fix the following issues:
1. Missing walls, doors or features that are present in the image but not in the code.
2. Intersecting objects (e.g. stairs clipping through the ceiling or walls).
3. Incorrect dimensions or proportions — walls should be 2.4–2.6 units tall (residential scale), NOT taller.
4. Z-fighting or flickering textures (ensure tiny gaps exist between overlapping coplanar faces).
5. Floating objects or misaligned elements.

Fix the code and output the complete, corrected single-page HTML file.`;

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
 * Phase 1: Extracts a structured JSON overview of walls, rooms, and architectural elements from the image.
 */
export const extractWallJSON = async (
  imageBase64: string,
  onThoughtUpdate?: (thought: string) => void
): Promise<string> => {
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeMatch = imageBase64.match(/^data:(.*?);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  let fullResponse = '';

  const response = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        {
          inlineData: { mimeType, data: base64Data },
        },
        { text: EXTRACT_WALLS_PROMPT },
      ],
    },
    config: { thinkingConfig: { includeThoughts: true } },
  });

  for await (const chunk of response) {
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        const p = part as any;
        if (p.thought) {
          if (onThoughtUpdate && p.text) onThoughtUpdate(p.text);
        } else if (p.text) {
          fullResponse += p.text;
        }
      }
    }
  }
  return extractJsonFromText(fullResponse);
};

/**
 * Phase 2: Generates the base HTML scene (walls, floors, doors) using the extracted JSON.
 */
export const generateBaseScene = async (
  imageBase64: string,
  jsonMap: string,
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
        { inlineData: { mimeType, data: base64Data } },
        { text: BASE_SCENE_PROMPT },
        { text: `JSON Map:\n${jsonMap}` },
      ],
    },
    config: { thinkingConfig: { includeThoughts: true } },
  });

  for await (const chunk of response) {
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        const p = part as any;
        if (p.thought) {
          if (onThoughtUpdate && p.text) onThoughtUpdate(p.text);
        } else if (p.text) {
          fullHtml += p.text;
        }
      }
    }
  }
  return extractHtmlFromText(fullHtml);
};

/**
 * Phase 3: Injects furniture into the base HTML scene.
 */
export const generateFurnitureScene = async (
  imageBase64: string,
  baseHtml: string,
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
        { inlineData: { mimeType, data: base64Data } },
        { text: FURNITURE_PROMPT },
        { text: `Base HTML:\n${baseHtml}` },
      ],
    },
    config: { thinkingConfig: { includeThoughts: true } },
  });

  for await (const chunk of response) {
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        const p = part as any;
        if (p.thought) {
          if (onThoughtUpdate && p.text) onThoughtUpdate(p.text);
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
