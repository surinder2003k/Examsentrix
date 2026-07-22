'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';

export default function StudentResults({ examId }) {
  const { getToken } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('percentage');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadResults();
  }, [examId]);

  const loadResults = async () => {
    try {
      const token = await getToken();
      api.setToken(token);
      const data = await api.getResults(examId);
      setStudents(data?.students || []);
    } catch (e) {
      console.error('Load results error:', e);
    }
    setLoading(false);
  };

  const sorted = [...students].sort((a, b) => {
    if (sortBy === 'percentage') return (b.percentage || 0) - (a.percentage || 0);
    if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
    if (sortBy === 'alerts') return (b.focus_alert_count || 0) - (a.focus_alert_count || 0);
    return 0;
  }).filter(s => {
    if (filter === 'passed') return (s.percentage || 0) >= 40;
    if (filter === 'failed') return (s.percentage || 0) < 40;
    if (filter === 'cheating') return (s.focus_alert_count || 0) > 5;
    return true;
  });

  if (loading) return <div className="text-center py-8 text-gray-500">Loading results...</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm">
          <option value="percentage">Sort by Percentage</option>
          <option value="score">Sort by Score</option>
          <option value="alerts">Sort by Alerts</option>
        </select>
        <div className="flex gap-2">
          {['all', 'passed', 'failed', 'cheating'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500 ml-auto">{sorted.length} students</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Percentage</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alerts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name || 'Unknown'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.score || 0}/{s.total_questions || 0}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium ${(s.percentage || 0) >= 40 ? 'text-green-600' : 'text-red-600'}`}>
                    {s.percentage || 0}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    (s.percentage || 0) >= 40 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {(s.percentage || 0) >= 40 ? 'Passed' : 'Failed'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {s.focus_alert_count || 0} focus / {s.tab_switch_count || 0} tabs
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

