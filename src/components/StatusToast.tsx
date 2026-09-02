import React, { useEffect } from 'react';

interface StatusToastProps {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}

/** Transient, non-blocking status line (import results, errors). */
const StatusToast: React.FC<StatusToastProps> = ({ message, onDismiss, durationMs = 6000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;
  const isError = /failed|error/i.test(message);
  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 z-[100] max-w-[70vw] -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
        isError ? 'bg-red-700/90' : 'bg-gray-900/85'
      }`}
      onClick={onDismiss}
    >
      {message}
    </div>
  );
};

export default StatusToast;
