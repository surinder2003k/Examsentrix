'use client';
import { useEffect } from 'react';

export function useKeyboardBlock(active = true) {
  useEffect(() => {
    if (!active) return;

    const blockKeys = (e) => {
      // Only block actual cheat-related shortcuts
      if (
        e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase()) ||
        e.key === 'F12' ||
        (e.altKey && e.key === 'Tab') ||
        (e.metaKey && ['c', 'v', 'x'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const blockContextMenu = (e) => e.preventDefault();

    const blockCopy = (e) => e.preventDefault();

    const blockDrop = (e) => e.preventDefault();

    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('contextmenu', blockContextMenu, true);
    document.addEventListener('copy', blockCopy, true);
    document.addEventListener('cut', blockCopy, true);
    document.addEventListener('paste', blockCopy, true);
    document.addEventListener('drop', blockDrop, true);

    return () => {
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('contextmenu', blockContextMenu, true);
      document.removeEventListener('copy', blockCopy, true);
      document.removeEventListener('cut', blockCopy, true);
      document.removeEventListener('paste', blockCopy, true);
      document.removeEventListener('drop', blockDrop, true);
    };
  }, [active]);
}

