'use client';
import React from 'react';

export default function ExamTimer({ timeLeft, formattedTime }) {
  const minutes = Math.floor(timeLeft / 60);
  const isLow = minutes < 10;

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
      isLow ? 'bg-red-900/50 border border-red-500' : 'bg-gray-700'
    }`}>
      <svg className={`w-5 h-5 ${isLow ? 'text-red-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={`font-mono text-xl font-bold ${isLow ? 'text-red-400' : 'text-white'}`}>
        {formattedTime}
      </span>
      {isLow && (
        <span className="text-xs text-red-300 animate-pulse">Low Time!</span>
      )}
    </div>
  );
}

