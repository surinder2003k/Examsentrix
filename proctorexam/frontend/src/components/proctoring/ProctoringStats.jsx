'use client';
import React from 'react';

export default function ProctoringStats({ stats }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { label: 'Total Students', value: stats.total || 0, color: 'blue' },
        { label: 'Active Now', value: stats.active || 0, color: 'green' },
        { label: 'Focus Alerts', value: stats.alerts || 0, color: 'yellow' },
        { label: 'Tab Switches', value: stats.tabSwitches || 0, color: 'red' },
      ].map(s => (
        <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          <p className="text-sm text-gray-500">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

