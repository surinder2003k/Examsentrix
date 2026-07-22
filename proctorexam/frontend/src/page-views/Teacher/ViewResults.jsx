'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { formatDate } from '../../utils/helpers';
import { API_BASE_URL } from '../../utils/constants';
import { showAlert, showConfirm } from '../../components/AlertModal';

const SEVERITY_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const EVENT_ICONS = {
  violation: '🚨',
  suspicious: '⚠️',
  tab_switch: '📑',
  focus_lost: '👁️',
  fullscreen_exit: '🖥️',
  teacher_message: '💬',
  force_submit: '⛔',
  multiple_faces: '👥',
  no_face: '😐',
  looking_left: '👀',
  looking_right: '👀',
  looking_up: '👀',
  looking_down: '👀',
};

function StudentDetailModal({ studentExamId, exam, onClose }) {
  const { getToken } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('answers');

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/api/monitoring/student-exams/${studentExamId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error('Load student detail error:', e);
      }
      setLoading(false);
    };
    load();
  }, [studentExamId, getToken]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-2xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="spinner"><div className="spinner-circle"></div></div>
        </div>
      </div>
    );
  }

  if (!data || data.status === 'pending') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm text-center" onClick={e => e.stopPropagation()}>
          <p className="text-gray-500">No data available for this student.</p>
          <button onClick={onClose} className="mt-4 btn btn-primary btn-sm">Close</button>
        </div>
      </div>
    );
  }

  const { studentExam, questions, proctoringLogs } = data;
  const passed = studentExam?.percentage >= (exam?.passing_percentage || 40);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{studentExam?.users?.name || 'Student'}</h2>
            <p className="text-xs text-gray-500">{studentExam?.users?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {Math.round(studentExam?.percentage || 0)}% — {passed ? 'Passed' : 'Failed'}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 p-5 border-b bg-gray-50">
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">{studentExam?.score || 0}</div>
            <div className="text-xs text-gray-500">Score</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">{questions?.length || 0}</div>
            <div className="text-xs text-gray-500">Questions</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-amber-600">{studentExam?.tab_switch_count || 0}</div>
            <div className="text-xs text-gray-500">Tab Switches</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-red-600">{studentExam?.focus_alert_count || 0}</div>
            <div className="text-xs text-gray-500">AI Alerts</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('answers')}
            className={`flex-1 py-3 text-sm font-semibold transition ${activeTab === 'answers' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            MCQ Answers ({questions?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex-1 py-3 text-sm font-semibold transition ${activeTab === 'alerts' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            AI Proctoring Logs ({proctoringLogs?.length || 0})
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'answers' && (
            <div className="space-y-3">
              {(!questions || questions.length === 0) ? (
                <p className="text-gray-400 text-center py-8">No questions found.</p>
              ) : (
                questions.map((q, idx) => {
                  const response = studentExam?.responses?.find(r => r.question_id === q.id);
                  const isCorrect = response?.selected_answer === q.correct_answer;
                  const answered = response?.selected_answer !== undefined && response?.selected_answer !== null;
                  return (
                    <div key={q.id} className={`p-4 rounded-xl border ${isCorrect ? 'border-green-200 bg-green-50' : answered ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-gray-500">Q{idx + 1} <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${q.difficulty === 'easy' ? 'bg-green-100 text-green-700' : q.difficulty === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{(q.difficulty || 'easy').toUpperCase()}</span></span>
                        <span className={`text-xs font-bold ${isCorrect ? 'text-green-600' : answered ? 'text-red-600' : 'text-gray-400'}`}>
                          {isCorrect ? '✓ Correct' : answered ? '✗ Incorrect' : '⊘ Not Answered'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 font-medium mb-2">{q.question_text}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {q.options?.map((opt, oi) => {
                          const isSelected = response?.selected_answer === oi;
                          const isRight = q.correct_answer === oi;
                          let cls = 'bg-white border-gray-200 text-gray-600';
                          if (isRight && isSelected) cls = 'bg-green-100 border-green-400 text-green-800 font-bold';
                          else if (isRight) cls = 'bg-green-50 border-green-300 text-green-700';
                          else if (isSelected) cls = 'bg-red-100 border-red-400 text-red-800 font-bold';
                          return (
                            <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg border ${cls}`}>
                              {String.fromCharCode(65 + oi)}. {opt}
                              {isRight && <span className="ml-1">✓</span>}
                              {isSelected && !isRight && <span className="ml-1">✗</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-2">
              {(!proctoringLogs || proctoringLogs.length === 0) ? (
                <p className="text-gray-400 text-center py-8">No proctoring alerts for this student.</p>
              ) : (
                proctoringLogs.map((log) => (
                  <div key={log.id} className={`p-3 rounded-xl border ${SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.low}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{EVENT_ICONS[log.event_type] || '📋'}</span>
                        <div>
                          <span className="text-sm font-bold capitalize">{log.event_type?.replace(/_/g, ' ')}</span>
                          {log.event_data?.observation && (
                            <p className="text-xs mt-0.5 opacity-80">{log.event_data.observation}</p>
                          )}
                          {log.event_data?.message && (
                            <p className="text-xs mt-0.5 opacity-80">"{log.event_data.message}"</p>
                          )}
                          {log.event_data?.confidence !== undefined && (
                            <span className="text-[10px] opacity-60">Confidence: {Math.round(log.event_data.confidence * 100)}%</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] opacity-60 whitespace-nowrap">{formatDate(log.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ViewResults() {
  const { examId } = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('percentage');
  const [filterStatus, setFilterStatus] = useState('all');
  const [releasing, setReleasing] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const handleReleaseResults = async () => {
    const confirmed = await showConfirm({
      title: 'Release Results',
      message: 'Are you sure you want to release the exam results to all students? They will be able to see their scores immediately.',
      confirmText: 'Release Results',
      cancelText: 'Cancel',
      severity: 'info',
    });
    if (!confirmed) return;
    setReleasing(true);
    try {
      const token = await getToken();
      api.setToken(token);
      await api.releaseResults(examId);
      const examRes = await api.getExam(examId);
      setExam(examRes.exam);
      showAlert({ title: 'Success', message: 'Results have been successfully released to all students!', severity: 'success' });
    } catch (error) {
      console.error('Release results error:', error);
      showAlert({ title: 'Error', message: 'Failed to release results: ' + error.message, severity: 'error' });
    }
    setReleasing(false);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken();
        api.setToken(token);

        const examRes = await api.getExam(examId);
        setExam(examRes.exam);

        const res = await fetch(`${API_BASE_URL}/api/monitoring/exams/${examId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setStudents([]);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setStudents(data.students || []);
      } catch (error) {
        console.error('Load results error:', error);
      }
      setLoading(false);
    };
    loadData();
  }, [examId]);

  const sortedStudents = [...students]
    .filter(s => {
      if (filterStatus === 'passed') return s.percentage >= (exam?.passing_percentage || 40);
      if (filterStatus === 'failed') return s.percentage < (exam?.passing_percentage || 40);
      if (filterStatus === 'cheating') return (s.focus_alert_count || 0) > 5 || (s.tab_switch_count || 0) > 3;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'percentage') return (b.percentage || 0) - (a.percentage || 0);
      if (sortBy === 'time') return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
      if (sortBy === 'alerts') return (b.focus_alert_count || 0) - (a.focus_alert_count || 0);
      return 0;
    });

  const stats = {
    total: students.length,
    completed: students.filter(s => s.status === 'completed').length,
    passed: students.filter(s => s.percentage >= (exam?.passing_percentage || 40)).length,
    failed: students.filter(s => s.status === 'completed' && s.percentage < (exam?.passing_percentage || 40)).length,
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="spinner"><div className="spinner-circle"></div></div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Exam Results</h1>
            <p className="text-xs sm:text-sm text-gray-500">{exam?.title}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!exam?.results_released && (
              <button
                onClick={handleReleaseResults}
                disabled={releasing}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
              >
                {releasing ? 'Releasing...' : 'Release Results to Students'}
              </button>
            )}
            {exam?.results_released && (
              <span className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold">
                Results Released
              </span>
            )}
            <button onClick={() => router.push('/dashboard')} className="text-primary-600 hover:underline text-sm font-semibold">
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Students</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.completed}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.passed}</div>
            <div className="text-sm text-gray-500">Passed</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-gray-500">Failed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {['all', 'passed', 'failed', 'cheating'].map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  filterStatus === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="percentage">Sort by Score</option>
            <option value="time">Sort by Time</option>
            <option value="alerts">Sort by Alerts</option>
          </select>
        </div>

        {/* Results Table */}
        <div className="tbl-wrapper">
          <table className="tbl">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Student</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Score</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Percentage</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Tab Switches</th>
                <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Focus Alerts</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No results found.
                  </td>
                </tr>
              ) : (
                sortedStudents.map((student) => {
                  const passed = student.percentage >= (exam?.passing_percentage || 40);
                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => setSelectedStudent(student)}
                    >
                      <td className="px-6 py-4" data-label="Student">
                        <span className="font-medium text-gray-900">{student.users?.name || 'Unknown'}</span>
                        <span className="block text-xs text-gray-400">{student.users?.email}</span>
                      </td>
                      <td className="px-6 py-4 text-center font-medium" data-label="Score">{student.score || 0}</td>
                      <td className="px-6 py-4 text-center" data-label="Percentage">
                        <span className={`font-medium ${passed ? 'text-green-600' : 'text-red-600'}`}>
                          {Math.round(student.percentage || 0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center" data-label="Status">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {passed ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600" data-label="Tab Switches">{student.tab_switch_count || 0}</td>
                      <td className="px-6 py-4 text-center text-gray-600" data-label="Focus Alerts">{student.focus_alert_count || 0}</td>
                      <td className="px-6 py-4 text-right text-sm text-gray-500" data-label="Submitted">
                        {student.submitted_at ? formatDate(student.submitted_at) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">Click any student row to view detailed MCQ answers & AI proctoring logs</p>
      </main>

      {/* Student Detail Modal */}
      {selectedStudent && (
        <StudentDetailModal
          studentExamId={selectedStudent.id}
          exam={exam}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}
