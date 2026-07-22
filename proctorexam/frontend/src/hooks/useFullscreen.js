'use client';
import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Cross-platform fullscreen hook.
 *
 * Strategy:
 *  - Desktop: use the native Fullscreen API (requestFullscreen / exitFullscreen).
 *  - Mobile / iOS: the Fullscreen API is blocked or unavailable.  We fall back to
 *    a CSS "fake fullscreen" that pins the exam wrapper to cover the entire viewport
 *    via a class added to <body> (`exam-fullscreen`).  The actual overlay is
 *    rendered by TakeExam.jsx when `isMobileFull` is true.
 *
 * `exitAttempts` increments every time the student leaves fullscreen
 * (native exit OR pressing the mobile back button / closing overlay).
 */

const isMobileDevice = () =>
  typeof window !== 'undefined' &&
  (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !window.MSGestureEvent));

const supportsNativeFullscreen = () =>
  typeof document !== 'undefined' &&
  (typeof document.documentElement.requestFullscreen === 'function' ||
  typeof document.documentElement.webkitRequestFullscreen === 'function');

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileFull, setIsMobileFull] = useState(false);
  const [exitAttempts, setExitAttempts] = useState(0);
  const intentionalExitRef = useRef(false);
  const gracePeriodRef = useRef(false);

  // ── Native fullscreen helpers ──────────────────────────────────────────────
  const enterNativeFullscreen = useCallback(async () => {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
      setIsFullscreen(true);
      gracePeriodRef.current = true;
      setTimeout(() => { gracePeriodRef.current = false; }, 3000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitNativeFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      }
    } catch {}
    setIsFullscreen(false);
  }, []);

  // ── CSS fake-fullscreen helpers (mobile) ───────────────────────────────────
  const enterMobileFull = useCallback(() => {
    document.body.classList.add('exam-fullscreen');
    setIsMobileFull(true);
    setIsFullscreen(true);
    gracePeriodRef.current = true;
    setTimeout(() => { gracePeriodRef.current = false; }, 3000);
    window.scrollTo(0, 0);
    // Push a history entry so back button triggers popstate instead of leaving page
    if (!isMobileFull) {
      window.history.pushState({ examFullscreen: true }, '');
    }
    return true;
  }, [isMobileFull]);

  const exitMobileFull = useCallback(() => {
    document.body.classList.remove('exam-fullscreen');
    setIsMobileFull(false);
    setIsFullscreen(false);
    setExitAttempts(prev => prev + 1);
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(async () => {
    // Always try native fullscreen first (works on Android Chrome & desktop)
    if (supportsNativeFullscreen()) {
      try {
        const ok = await enterNativeFullscreen();
        if (ok) return true;
      } catch (e) {
        // Native fullscreen blocked — fall through to CSS overlay
      }
    }
    // Fallback: CSS overlay for iOS or when native is blocked
    return enterMobileFull();
  }, [enterNativeFullscreen, enterMobileFull]);

  const exitFullscreen = useCallback(async () => {
    intentionalExitRef.current = true;
    if (isMobileFull) {
      exitMobileFull();
    } else {
      await exitNativeFullscreen();
    }
  }, [isMobileFull, exitMobileFull, exitNativeFullscreen]);

  // ── Listen for native fullscreen change (desktop) ─────────────────────────
  useEffect(() => {
    const handleChange = () => {
      const isFull = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement
      );
      setIsFullscreen(isFull);
      if (!isFull && !isMobileFull) {
        if (intentionalExitRef.current) {
          intentionalExitRef.current = false;
          return;
        }
        if (gracePeriodRef.current) return;
        setExitAttempts(prev => prev + 1);
      }
    };

    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, [isMobileFull]);

  // ── Mobile CSS fullscreen exit detection ───────────────────────────────────
  // Detect when user leaves CSS fullscreen overlay (back button, swipe, app switch)
  // Also handles native fullscreen exit via back button on Android
  useEffect(() => {
    if (!isMobileFull) return;

    const handlePopState = () => {
      if (!intentionalExitRef.current && !gracePeriodRef.current) {
        setExitAttempts(prev => prev + 1);
      }
    };

    const handleVisibility = () => {
      if (!intentionalExitRef.current && !gracePeriodRef.current) {
        setExitAttempts(prev => prev + 1);
      }
    };

    const handlePageHide = () => {
      if (!intentionalExitRef.current && !gracePeriodRef.current) {
        setExitAttempts(prev => prev + 1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isMobileFull]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      document.body.classList.remove('exam-fullscreen');
    };
  }, []);

  return {
    isFullscreen,
    isMobileFull,
    exitAttempts,
    enterFullscreen,
    exitFullscreen,
    setExitAttempts,
  };
}

