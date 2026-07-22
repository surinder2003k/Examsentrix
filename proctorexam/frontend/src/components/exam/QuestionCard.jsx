'use client';
import React from 'react';

export default function QuestionCard({ question, index, total, selectedAnswer, onAnswer, isMarked, onToggleReview }) {
  if (!question) return null;
  
  const options = question.options || [];
  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <div className="w-full max-w-4xl bg-gray-800 rounded-2xl p-8 shadow-xl border border-gray-700">
      {/* Question Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <span className="text-sm text-blue-400 font-medium">Question {index + 1} of {total}</span>
          <span className="ml-3 px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
            {question.difficulty || 'medium'}
          </span>
          {question.category && (
            <span className="ml-2 px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs">
              {question.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{question.marks || 1} mark(s)</span>
          <button
            onClick={onToggleReview}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              isMarked 
                ? 'bg-yellow-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {isMarked ? '★ Marked' : '☆ Mark for Review'}
          </button>
        </div>
      </div>

      {/* Question Text */}
      <div className="mb-8">
        <p className="text-xl text-white leading-relaxed">{question.question_text}</p>
      </div>

      {/* Options */}
      <div className="space-y-4">
        {options.map((option, optIndex) => (
          <button
            key={optIndex}
            onClick={() => onAnswer(optIndex)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
              selectedAnswer === optIndex
                ? 'bg-blue-600/20 border-blue-500 text-white'
                : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
            }`}
          >
            <span className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
              selectedAnswer === optIndex
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 text-gray-300'
            }`}>
              {optionLabels[optIndex]}
            </span>
            <span className="text-left flex-1">{option}</span>
            {selectedAnswer === optIndex && (
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Status */}
      <div className="mt-6 pt-6 border-t border-gray-700 flex justify-between text-sm text-gray-400">
        <span>{selectedAnswer !== undefined ? 'Answered' : 'Not answered'}</span>
        <span>{isMarked ? 'Marked for review' : ''}</span>
      </div>
    </div>
  );
}

