'use client';
import React, { useState } from 'react';
import StudentLiveCard from './StudentLiveCard';
import ProctoringStats from './ProctoringStats';

export default function LiveMonitorGrid({ students = [], examId, onSelectStudent, onSendMessage, onForceSubmit }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = students.filter(s => {
    if (filter === 'issues' && (s.focus_alert_count || 0) === 0 && (s.tab_switch_count || 0) === 0) return false;
    if (filter === 'tab' && (s.tab_switch_count || 0) === 0) return false;
    if (search && !s.name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <input type="text" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
        <div className="flex gap-2">
          {['all', 'issues', 'tab'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : f === 'issues' ? '⚠ Issues' : 'Tab Switchers'}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} active</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(student => (
          <StudentLiveCard key={student.id} student={student} onClick={() => onSelectStudent?.(student)} />
        ))}
      </div>
    </div>
  );
}

