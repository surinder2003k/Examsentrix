'use client';
import React from 'react';

export default function StudentLiveCard({ student, onClick }) {
  const alerts = (student.focus_alert_count || 0) + (student.tab_switch_count || 0);
  const statusColor = alerts > 5 ? 'red' : alerts > 2 ? 'yellow' : 'green';
  
  return (
    <div onClick={onClick} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition cursor-pointer card-hover">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
          statusColor === 'red' ? 'bg-red-500' : statusColor === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
        }`}>
          {student.name?.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{student.name || 'Unknown'}</p>
          <p className="text-xs text-gray-500">Q: {student.current_question || '-'}</p>
        </div>
        <div className={`w-3 h-3 rounded-full ${
          statusColor === 'red' ? 'bg-red-500 animate-pulse' : statusColor === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
        }`} />
      </div>
      <div className="flex gap-3 text-xs text-gray-600">
        <span>⚠ {student.focus_alert_count || 0}</span>
        <span>↗ {student.tab_switch_count || 0}</span>
        <span>⏱ {student.time_remaining || '-'}</span>
      </div>
    </div>
  );
}

