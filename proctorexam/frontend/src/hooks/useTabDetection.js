'use client';
import { useEffect, useCallback, useRef } from 'react';

export function useTabDetection(onTabSwitch) {
  const callbackRef = useRef(onTabSwitch);

  useEffect(() => {
    callbackRef.current = onTabSwitch;
  }, [onTabSwitch]);

  useEffect(() => {
    const handleVisibility = () => {
      // Only fire when tab becomes hidden (switched away / minimized)
      if (document.visibilityState === 'hidden' && callbackRef.current) {
        callbackRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}