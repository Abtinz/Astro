import React, { useState, useEffect, useRef } from 'react';
import Stepper from './components/Stepper';
import UploadZone from './components/UploadZone';
import Viewer from './components/Viewer';
import LoadingOverlay from './components/LoadingOverlay';
import { generateFloorPlanRender, extractWallJSON, generateBaseScene, generateFurnitureScene, fixVoxelScene } from './services/gemini';
import { hideBodyText, zoomCamera, injectWASDControls, injectCityEnvironment, fixZFighting } from './utils/html';
import sampleStyleUrl from './assets/sample-style.jpg';
import demoRenderUrl from './assets/demo-render.jpg';

type AppStatus = 'idle' | 'generating_render' | 'extracting_walls' | 'generating_base_scene' | 'generating_furniture' | 'validating_voxels' | 'error';
type ViewMode = 'upload' | 'render' | 'voxel';

const isDemo = new URLSearchParams(window.location.search).has('demo');

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [thinkingText, setThinkingText] = useState<string | null>(null);

  // Data
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [voxelCode, setVoxelCode] = useState<string | null>(null);
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const demoSceneRef = useRef<string | null>(null);

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('upload');

  // Load the bundled style reference on mount
  useEffect(() => {
    const loadStyleReference = async () => {
      try {
        const response = await fetch(sampleStyleUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = (e) => {
          setStyleReference(e.target?.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error('Failed to load style reference:', err);
      }
    };
    loadStyleReference();

    // Pre-load demo scene HTML
    if (isDemo) {
      (async () => {
        for (const url of ['/demo-scene.html', '/app/demo-scene.html']) {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const html = await resp.text();
              if (html.includes('<')) { demoSceneRef.current = html; return; }
            }
          } catch { /* try next */ }
        }
      })();
    }
  }, []);

  const currentStep: 1 | 2 | 3 = voxelCode ? 3 : renderedImage ? 2 : 1;

  const handleFileSelect = (base64: string) => {
    setUploadedImage(base64);
    setRenderedImage(null);
    setVoxelCode(null);
    setViewMode('upload');
    setErrorMsg('');
  };

  const handleGenerateRender = async () => {
    if (!uploadedImage || !styleReference) return;

    setStatus('generating_render');
    setErrorMsg('');
    setThinkingText(null);

    if (isDemo) {
      // Demo mode: fake loading with pre-built render
      const phases = [
        { text: 'Analyzing floor plan layout...', delay: 900 },
        { text: 'Mapping room boundaries...', delay: 1200 },
        { text: 'Generating photorealistic textures...', delay: 1000 },
        { text: 'Applying lighting and shadows...', delay: 800 },
      ];
      for (const phase of phases) {
        setThinkingText(phase.text);
        await new Promise(r => setTimeout(r, phase.delay));
      }
      // Load the demo render as base64
      const resp = await fetch(demoRenderUrl);
      const blob = await resp.blob();
      const base64 = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(blob);
      });
      setRenderedImage(base64);
      setVoxelCode(null);
      setViewMode('render');
      setStatus('idle');
      setThinkingText(null);
      return;
    }

    try {
      const result = await generateFloorPlanRender(uploadedImage, styleReference);
      setRenderedImage(result);
      setVoxelCode(null);
      setViewMode('render');
      setStatus('idle');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to generate 3D render.');
      console.error(err);
    }
  };

  const handleGenerateVoxels = async () => {
    if (!renderedImage) return;

    setStatus('extracting_walls');
    setErrorMsg('');
    setThinkingText(null);

    if (isDemo) {
      // Demo mode: fetch scene in parallel with fake loading animation
      const fetchScene = async (): Promise<string> => {
        if (demoSceneRef.current) return demoSceneRef.current;
        // Try multiple paths since BASE_URL varies between dev and Vercel
        for (const url of ['/demo-scene.html', '/app/demo-scene.html']) {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const html = await resp.text();
              if (html.includes('<') ) { demoSceneRef.current = html; return html; }
            }
          } catch { /* try next */ }
        }
        throw new Error('Could not load demo scene');
      };
      const scenePromise = fetchScene();

      const demoPhases: { status: AppStatus; texts: { text: string; delay: number }[] }[] = [
        { status: 'extracting_walls', texts: [
          { text: 'Detecting wall segments...', delay: 700 },
          { text: 'Building coordinate map...', delay: 600 },
        ]},
        { status: 'generating_base_scene', texts: [
          { text: 'Constructing floor geometry...', delay: 700 },
          { text: 'Extruding wall volumes...', delay: 600 },
        ]},
        { status: 'generating_furniture', texts: [
          { text: 'Placing bedroom furniture...', delay: 600 },
          { text: 'Adding bathroom fixtures...', delay: 500 },
          { text: 'Arranging kitchen elements...', delay: 500 },
        ]},
        { status: 'validating_voxels', texts: [
          { text: 'Checking collision overlaps...', delay: 400 },
          { text: 'Final scene validation...', delay: 300 },
        ]},
      ];

      try {
        for (const phase of demoPhases) {
          setStatus(phase.status);
          setThinkingText(null);
          for (const t of phase.texts) {
            setThinkingText(t.text);
            await new Promise(r => setTimeout(r, t.delay));
          }
        }

        const sceneHtml = await scenePromise;
        setVoxelCode(sceneHtml);
        setViewMode('voxel');
        setStatus('idle');
        setThinkingText(null);
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Failed to load demo scene.');
      }
      return;
    }

    let thoughtBuffer = '';
    const extractHeader = (fragment: string) => {
        thoughtBuffer += fragment;
        const matches = thoughtBuffer.match(/\*\*([^*]+)\*\*/g);
        if (matches && matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            const header = lastMatch.replace(/\*\*/g, '').trim();
            setThinkingText((prev) => (prev === header ? prev : header));
        }
    };

    try {
      // Phase 1: Extract JSON
      const wallJson = await extractWallJSON(renderedImage, extractHeader);

      // Phase 2: Base Scene
      setStatus('generating_base_scene');
      setThinkingText(null);
      thoughtBuffer = '';
      const baseHtml = await generateBaseScene(renderedImage, wallJson, extractHeader);

      // Phase 3: Furniture
      setStatus('generating_furniture');
      setThinkingText(null);
      thoughtBuffer = '';
      const furnitureHtml = await generateFurnitureScene(renderedImage, baseHtml, extractHeader);

      // Phase 4: Validation
      setStatus('validating_voxels');
      setThinkingText(null);
      thoughtBuffer = '';

      const fixedCodeRaw = await fixVoxelScene(renderedImage, furnitureHtml, extractHeader);

      const code = fixZFighting(injectCityEnvironment(injectWASDControls(zoomCamera(hideBodyText(fixedCodeRaw)))));
      setVoxelCode(code);
      setViewMode('voxel');
      setStatus('idle');
      setThinkingText(null);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to generate 3D scene.');
      console.error(err);
    }
  };

  const handleDownload = () => {
    if (viewMode === 'render' && renderedImage) {
      const a = document.createElement('a');
      a.href = renderedImage;
      const ext = renderedImage.includes('image/jpeg') ? 'jpg' : 'png';
      a.download = `floor-plan-3d-render.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (viewMode === 'voxel' && voxelCode) {
      const a = document.createElement('a');
      a.href = `data:text/html;charset=utf-8,${encodeURIComponent(voxelCode)}`;
      a.download = `floor-plan-3d-scene.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleStartOver = () => {
    setUploadedImage(null);
    setRenderedImage(null);
    setVoxelCode(null);
    setViewMode('upload');
    setStatus('idle');
    setErrorMsg('');
    setThinkingText(null);
  };

  const isLoading = status === 'generating_render' || status === 'extracting_walls' || status === 'generating_base_scene' || status === 'generating_furniture' || status === 'validating_voxels';

  const getLoadingStatus = () => {
    if (status === 'generating_render') return 'Generating 3D render with Gemini Flash...';
    if (status === 'extracting_walls') return 'Extracting wall coordinate map...';
    if (status === 'generating_base_scene') return 'Building base architectural shell...';
    if (status === 'generating_furniture') return 'Generating and placing furniture...';
    if (status === 'validating_voxels') return 'Validating and fixing 3D scene...';
    return '';
  };

  // Determine viewer content
  const getViewerProps = () => {
    if (viewMode === 'voxel' && voxelCode) {
      return { mode: 'voxel' as const, voxelCode };
    }
    if (viewMode === 'render' && renderedImage) {
      return { mode: 'image' as const, imageSrc: renderedImage };
    }
    if (viewMode === 'upload' && uploadedImage) {
      return { mode: 'image' as const, imageSrc: uploadedImage };
    }
    return { mode: 'empty' as const };
  };

  return (
    <div className="app">
      <header className="app-header">
        {/* UPDATE: Replace with your deployed landing URL */}
        <a href="https://astro.sobhanra.com" className="back-home">&larr; Astro Suite</a>
        <h1>3D Floor Plan Visualizer</h1>
        <p className="app-subtitle">Transform your floor plan into an interactive 3D experience</p>
        {isDemo && <span className="demo-badge">Demo Mode</span>}
      </header>

      <Stepper currentStep={currentStep} />

      <div className="viewer-container">
        {/* Upload zone shown only when no image uploaded yet */}
        {!uploadedImage && !isLoading ? (
          <UploadZone onFileSelect={handleFileSelect} disabled={isLoading} />
        ) : (
          <div className="viewer-wrapper">
            <Viewer {...getViewerProps()} />
            {isLoading && (
              <LoadingOverlay
                status={getLoadingStatus()}
                thinkingText={thinkingText}
              />
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="error-banner">
          Error: {errorMsg}
        </div>
      )}

      {/* Action Buttons */}
      <div className="actions">
        {/* Generation buttons — primary actions first */}
        {uploadedImage && (
          <button className="btn btn-primary" onClick={handleGenerateRender} disabled={isLoading || !styleReference}>
            {status === 'generating_render' ? 'Generating...' : renderedImage ? 'Regenerate 3D Render' : 'Generate 3D Render'}
          </button>
        )}
        {renderedImage && (
          <button className="btn btn-primary" onClick={handleGenerateVoxels} disabled={isLoading}>
            {status !== 'idle' && status !== 'error' && status !== 'generating_render' ? 'Generating...' : voxelCode ? 'Regenerate 3D Scene' : 'Generate 3D Scene'}
          </button>
        )}

        {/* View toggles */}
        {uploadedImage && renderedImage && viewMode !== 'upload' && (
          <button className="btn btn-secondary" onClick={() => setViewMode('upload')} disabled={isLoading}>
            View Original
          </button>
        )}
        {renderedImage && viewMode !== 'render' && (
          <button className="btn btn-secondary" onClick={() => setViewMode('render')} disabled={isLoading}>
            View 3D Render
          </button>
        )}
        {voxelCode && viewMode !== 'voxel' && (
          <button className="btn btn-secondary" onClick={() => setViewMode('voxel')} disabled={isLoading}>
            View 3D Scene
          </button>
        )}

        {/* Download */}
        {((viewMode === 'render' && renderedImage) || (viewMode === 'voxel' && voxelCode)) && (
          <button className="btn btn-secondary" onClick={handleDownload} disabled={isLoading}>
            Download {viewMode === 'render' ? 'Image' : 'HTML'}
          </button>
        )}

        {/* Start Over */}
        {uploadedImage && (
          <button className="btn btn-outline" onClick={handleStartOver} disabled={isLoading}>
            Start Over
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
