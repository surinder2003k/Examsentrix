'use client';
import { useState, useEffect, useRef } from 'react';

/**
 * Anti-cheat countdown timer.
 *
 * Anchors the remaining time to the server-provided `startedAt` timestamp so
 * that refreshing the page does NOT reset the countdown.
 *
 * @param {number} durationMinutes  - Total exam duration in minutes
 * @param {string|null} startedAt   - ISO timestamp of when the exam was started (from server)
 * @param {Function} onExpire       - Called once when the timer hits 0
 */
export function useCountdown(durationMinutes, startedAt, onExpire) {
  const onExpireRef = useRef(onExpire);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Derive initial remaining seconds from server timestamp to prevent cheating
  function calcRemaining() {
    if (!durationMinutes || durationMinutes <= 0) return 0;
    if (!startedAt) return durationMinutes * 60;

    // Ensure timestamp is parsed as UTC to avoid local timezone offset shifts
    let normalizedStartedAt = startedAt;
    if (typeof normalizedStartedAt === 'string' && !normalizedStartedAt.endsWith('Z') && !normalizedStartedAt.includes('+')) {
      normalizedStartedAt += 'Z';
    }

    const elapsedSeconds = Math.floor((Date.now() - new Date(normalizedStartedAt).getTime()) / 1000);
    const totalSeconds = durationMinutes * 60;
    return Math.max(0, totalSeconds - elapsedSeconds);
  }

  const [timeRemaining, setTimeRemaining] = useState(calcRemaining);
  const [isExpired, setIsExpired] = useState(false);

  // Re-anchor whenever startedAt or durationMinutes change
  useEffect(() => {
    if (!durationMinutes || durationMinutes <= 0) return;

    hasExpiredRef.current = false;
    const remaining = calcRemaining();
    setTimeRemaining(remaining);

    if (remaining <= 0 && durationMinutes > 0 && startedAt) {
      hasExpiredRef.current = true;
      setIsExpired(true);
      if (onExpireRef.current) onExpireRef.current();
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 1;
        return next < 0 ? 0 : next;
      });
    }, 1000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMinutes, startedAt]);

  // Detect expiry OUTSIDE the state updater to keep updater pure
  useEffect(() => {
    if (timeRemaining <= 0 && durationMinutes > 0 && startedAt && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      setIsExpired(true);
      if (onExpireRef.current) onExpireRef.current();
    }
  }, [timeRemaining, durationMinutes, startedAt]);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const isWarning = timeRemaining <= 600 && timeRemaining > 0;  // 10 minutes
  const isCritical = timeRemaining <= 120 && timeRemaining > 0; // 2 minutes

  return {
    timeRemaining,
    formatted,
    minutes,
    seconds,
    isExpired,
    isWarning,
    isCritical,
  };
}
