'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';

export default function HiddenCamera({ onFrame, isActive }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const onFrameRef = useRef(onFrame);
  const [error, setError] = useState(null);

  // Keep callback ref fresh
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (isActive) startCamera();
    else stopCamera();
    return () => {
      stopCamera();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 2 } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      startCaptureLoop();
    } catch (err) {
      setError('Camera access denied');
      console.error('Camera error:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCaptureLoop = useCallback(() => {
    intervalRef.current = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 160, 120);
        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        if (onFrameRef.current) onFrameRef.current(base64);
      }
    }, 2000);
  }, []);

  return (
    <div className="hidden">
      <video ref={videoRef} autoPlay playsInline muted className="w-0 h-0" />
      <canvas ref={canvasRef} className="w-0 h-0" />
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </div>
  );
}

