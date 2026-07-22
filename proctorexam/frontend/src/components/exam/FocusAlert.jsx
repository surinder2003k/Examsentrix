'use client';
import React from 'react';

export default function FocusAlert({ message, severity = 'warning' }) {
  const colors = {
    warning: 'bg-yellow-900/80 border-yellow-600 text-yellow-200',
    danger: 'bg-red-900/80 border-red-600 text-red-200',
    info: 'bg-blue-900/80 border-blue-600 text-blue-200',
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm animate-slideIn ${colors[severity] || colors.warning}`}>
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

