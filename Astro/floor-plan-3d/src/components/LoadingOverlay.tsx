import React, { useRef, useEffect } from 'react';
import loadingVideoUrl from '../assets/loading.mp4';

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

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ status, thinkingText }) => {
  const phase = PHASE_MAP[status];
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  }, []);

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        {/* Loading video */}
        <div className="loading-video-wrapper">
          <video
            ref={videoRef}
            src={loadingVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="loading-video"
          />
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
