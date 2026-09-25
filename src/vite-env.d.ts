/// <reference types="vite/client" />

// File System Access API save dialog (Chromium). Not yet in TypeScript's DOM lib.
interface Window {
  showSaveFilePicker(options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle>;
}
