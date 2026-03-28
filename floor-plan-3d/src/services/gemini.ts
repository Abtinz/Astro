import { GoogleGenAI } from '@google/genai';
import { extractHtmlFromText } from '../utils/html';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const RENDER_PROMPT = `Transform this 2D architectural floor plan into a 3D rendered visualization.
Match the style, perspective, and level of detail shown in the reference image.
Include realistic furniture, textures, materials, and lighting.
Maintain the exact room layout, dimensions, and labels from the original floor plan.
Use an isometric or slightly elevated perspective.

The first image is the floor plan to transform.
The second image is the style reference to match.`;

const VOXEL_PROMPT = `I have provided a 3D rendered floor plan image.
Code a beautiful voxel art scene that accurately represents this floor plan layout.
Write Three.js code as a single-page HTML file.
Include all rooms, walls, furniture, and architectural features visible in the image.
Make it interactive with OrbitControls for mouse rotation/zoom AND WASD keyboard controls for first-person movement:
- W: move camera forward
- A: move camera left
- S: move camera backward
- D: move camera right
- Q: move camera down
- E: move camera up
The WASD movement should translate the camera and orbit target together so the user can walk through the scene.`;

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
