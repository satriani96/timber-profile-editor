import React from 'react';

interface FloatingFinishButtonProps {
  onClick: () => void;
  visible: boolean;
}

const FloatingFinishButton: React.FC<FloatingFinishButtonProps> = ({ onClick, visible }) => {
  if (!visible) return null;
  return (
    <button
      onClick={onClick}
      className="fixed z-50 bottom-8 right-8 bg-green-600 hover:bg-green-700 text-white p-4 rounded-full shadow-lg flex items-center justify-center"
      title="Finish Spline (✓)"
      style={{ fontSize: 24 }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  );
};

export default FloatingFinishButton;
