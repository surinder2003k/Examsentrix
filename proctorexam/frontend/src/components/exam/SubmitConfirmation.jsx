'use client';
import React from 'react';

export default function SubmitConfirmation({ answeredCount, total, onSubmit, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-gray-700 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-4">Submit Exam?</h2>
        <p className="text-gray-300 mb-6">
          You have answered <span className="text-green-400 font-bold">{answeredCount}</span> of{' '}
          <span className="text-white font-bold">{total}</span> questions.
          {answeredCount < total && (
            <span className="block mt-2 text-yellow-400">
              ⚠ {total - answeredCount} questions unanswered!
            </span>
          )}
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 px-6 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={loading}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</>
            ) : 'Submit Exam'}
          </button>
        </div>
      </div>
    </div>
  );
}

