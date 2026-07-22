'use client';
import React from 'react';

export default function NavigationPanel({ total, currentIndex, responses, markedForReview, onNavigate, answeredCount }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Question Palette</h3>
      <div className="text-xs text-gray-400 mb-4">
        <span className="text-green-400">{answeredCount}</span> Answered • 
        <span className="text-yellow-400"> {markedForReview.size}</span> Review
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: total }, (_, i) => {
          const isAnswered = responses[i] !== undefined;
          const isMarked = markedForReview.has(i);
          const isCurrent = i === currentIndex;
          let btnClass = 'bg-gray-700 text-gray-300 hover:bg-gray-600';
          if (isCurrent) btnClass = 'bg-blue-600 text-white ring-2 ring-blue-400';
          else if (isAnswered && isMarked) btnClass = 'bg-yellow-700 text-yellow-200';
          else if (isAnswered) btnClass = 'bg-green-700 text-green-200';
          else if (isMarked) btnClass = 'bg-yellow-900/50 text-yellow-300';
          return (
            <button key={i} onClick={() => onNavigate(i)}
              className={`w-9 h-9 rounded-lg text-xs font-medium transition ${btnClass}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

