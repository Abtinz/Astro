import React from 'react';

interface LoadingOverlayProps {
  status: string;
  thinkingText?: string | null;
  progress?: number; // 0-100
}

const PHASE_MAP: Record<string, { label: string; progress: number }> = {
  'Generating 3D render with Gemini Flash...': { label: 'Phase 1 of 1', progress: 50 },
  'Extracting wall coordinate map...': { label: 'Phase 1 of 4', progress: 15 },
  'Building base architectural shell...': { label: 'Phase 2 of 4', progress: 40 },
  'Generating and placing furniture...': { label: 'Phase 3 of 4', progress: 65 },
  'Validating and fixing 3D scene...': { label: 'Phase 4 of 4', progress: 85 },
};

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ status, thinkingText }) => {
  const phase = PHASE_MAP[status];

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        {/* Orbital spinner */}
        <div className="loading-spinner">
          <div className="loading-spinner__ring" />
          <div className="loading-spinner__ring" />
          <div className="loading-spinner__ring" />
          <div className="loading-spinner__dot" />
        </div>

        {/* Status text */}
        <div className="loading-status">{status}</div>

        {/* Phase indicator */}
        {phase && <div className="loading-phase">{phase.label}</div>}

        {/* Progress bar */}
        {phase && (
          <div className="loading-progress">
            <div
              className="loading-progress__bar"
              style={{ width: `${phase.progress}%` }}
            />
          </div>
        )}

        {/* Thinking text */}
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
