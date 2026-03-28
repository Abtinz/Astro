import React from 'react';

interface ViewerProps {
  mode: 'empty' | 'image' | 'voxel';
  imageSrc?: string;
  voxelCode?: string;
}

const Viewer: React.FC<ViewerProps> = ({ mode, imageSrc, voxelCode }) => {
  if (mode === 'empty') {
    return (
      <div className="viewer viewer-empty">
        <p>Upload a floor plan to get started</p>
      </div>
    );
  }

  if (mode === 'image' && imageSrc) {
    return (
      <div className="viewer">
        <img src={imageSrc} alt="Floor plan" className="viewer-image" />
      </div>
    );
  }

  if (mode === 'voxel' && voxelCode) {
    return (
      <div className="viewer">
        <iframe
          title="Voxel Scene"
          srcDoc={voxelCode}
          className="viewer-iframe"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    );
  }

  return (
    <div className="viewer viewer-empty">
      <p>No content to display</p>
    </div>
  );
};

export default Viewer;
