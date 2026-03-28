import React from 'react';

interface LoadingOverlayProps {
  status: string;
  thinkingText?: string | null;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ status, thinkingText }) => {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-status">{status}</div>
        <div className="loading-thinking">
          {thinkingText ? (
            <span>{thinkingText}<span className="loading-dots" /></span>
          ) : (
            <span>Thinking<span className="loading-dots" /></span>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
