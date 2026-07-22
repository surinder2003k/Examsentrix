'use client';
import React, { useRef, useEffect, useState } from 'react';

export default function WebRTCVideo({ stream, studentName }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className="bg-gray-900 rounded-xl aspect-video flex items-center justify-center">
        <p className="text-gray-400">No video feed available</p>
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      <video ref={videoRef} autoPlay playsInline className="w-full aspect-video object-cover" />
      {studentName && (
        <div className="absolute bottom-2 left-2 bg-black/60 px-3 py-1 rounded-lg">
          <span className="text-white text-sm">{studentName}</span>
        </div>
      )}
    </div>
  );
}

