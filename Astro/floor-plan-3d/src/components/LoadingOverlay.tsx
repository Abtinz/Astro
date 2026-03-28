import React from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface LoadingOverlayProps {
  status: string;
  thinkingText?: string | null;
}

const PHASE_MAP: Record<string, { label: string; progress: number }> = {
  'Generating 3D render with Gemini Flash...': { label: 'Phase 1 of 1', progress: 50 },
  'Extracting wall coordinate map...': { label: 'Phase 1 of 4', progress: 15 },
  'Building base architectural shell...': { label: 'Phase 2 of 4', progress: 40 },
  'Generating and placing furniture...': { label: 'Phase 3 of 4', progress: 65 },
  'Validating and fixing 3D scene...': { label: 'Phase 4 of 4', progress: 85 },
};

const lottieUrl = `${import.meta.env.BASE_URL || '/'}loading.json`.replace(/\/\//g, '/');

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ status, thinkingText }) => {
  const phase = PHASE_MAP[status];

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-lottie">
          <DotLottieReact
            src={lottieUrl}
            loop
            autoplay
            backgroundColor="transparent"
          />
        </div>

        <div className="loading-status">{status}</div>

        {phase && <div className="loading-phase">{phase.label}</div>}

        {phase && (
          <div className="loading-progress">
            <div
              className="loading-progress__bar"
              style={{ width: `${phase.progress}%` }}
            />
          </div>
        )}

        {thinkingText ? (
          <div className="loading-thinking">
            {thinkingText}<span className="loading-dots" />
          </div>
        ) : (
          <div className="loading-thinking">
            Thinking<span className="loading-dots" />
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;
