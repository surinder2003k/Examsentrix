'use client';
import { useCallback, useRef, useEffect } from 'react';
import { CAMERA_FRAME_INTERVAL } from '../utils/constants';

export function useAIProctor(studentExamId, onFrameAnalysis, isActive = false) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = 160;
    canvas.height = 120;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compress to JPEG base64
    return canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
  }, []);

  const startProctoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5 } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Start sending frames at interval
      intervalRef.current = setInterval(() => {
        if (onFrameAnalysis && studentExamId) {
          const frame = captureFrame();
          if (frame) {
            onFrameAnalysis(studentExamId, frame);
          }
        }
      }, CAMERA_FRAME_INTERVAL);

      return true;
    } catch (error) {
      console.error('Failed to start camera:', error);
      return false;
    }
  }, [studentExamId, onFrameAnalysis, captureFrame]);

  const stopProctoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      stopProctoring();
    }
    return () => stopProctoring();
  }, [isActive, stopProctoring]);

  return {
    videoRef,
    canvasRef,
    startProctoring,
    stopProctoring,
    captureFrame,
  };
}

