'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { formatDate, getTimeRemaining } from '../../utils/helpers';
import useExamStore from '../../store/examStore';
import { showConfirm, showAlert } from '../../components/AlertModal';
import { useSocket } from '../../hooks/useSocket';

export default function TeacherDashboard() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { exams, examLoading, fetchExams, deleteExam, publishExam } = useExamStore();
  const socket = useSocket();
  const [actionLoading, setActionLoading] = useState({});
  const [filter, setFilter] = useState('all');
  const [liveCounts, setLiveCounts] = useState({}); // { examId: count }

  useEffect(() => {
    fetchExams();
  }, []);

  useEffect(() => {
    if (!socket.socket || !user?.id) return;
    socket.joinTeacher(user.id);

    const handleStudentStarted = (data) => {
      showAlert({
        title: 'Student Joined',
        message: `${data.studentName} joined "${data.examTitle}"`,
        severity: 'success',
      });
      setLiveCounts(prev => ({
        ...prev,
        [data.examId]: (prev[data.examId] || 0) + 1,
      }));
    };

    const handleStudentLeft = (data) => {
      setLiveCounts(prev => ({
        ...prev,
        [data.examId]: Math.max((prev[data.examId] || 1) - 1, 0),
      }));
    };

    socket.socket.on('student_started_exam', handleStudentStarted);
    socket.socket.on('student_left_exam', handleStudentLeft);
    return () => {
      socket.socket?.off('student_started_exam', handleStudentStarted);
      socket.socket?.off('student_left_exam', handleStudentLeft);
    };
  }, [socket.socket, user?.id]);

  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: 'Delete Exam',
      message: 'Are you sure you want to delete this exam? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      severity: 'danger',
    });
    if (!confirmed) return;
    setActionLoading(prev => ({ ...prev, [id]: 'delete' }));
    try {
      await deleteExam(id);
    } catch (err) {
      console.error('Delete error:', err);
    }
    setActionLoading(prev => ({ ...prev, [id]: null }));
  };

  const handlePublish = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: 'publish' }));
    try {
      await publishExam(id);
    } catch (err) {
      console.error('Publish error:', err);
    }
    setActionLoading(prev => ({ ...prev, [id]: null }));
  };

  const handleClose = async (id) => {
    const confirmed = await showConfirm({
      title: 'Close Exam',
      message: 'Are you sure you want to close this exam? Students will no longer be able to take it.',
      confirmText: 'Close Exam',
      cancelText: 'Cancel',
      severity: 'warning',
    });
    if (!confirmed) return;
    setActionLoading(prev => ({ ...prev, [id]: 'close' }));
    try {
      const token = await getToken();
      api.setToken(token);
      await api.closeExam(id);
      await fetchExams();
    } catch (err) {
      console.error('Close error:', err);
    }
    setActionLoading(prev => ({ ...prev, [id]: null }));
  };

  const getExamDeadlineStatus = (exam) => {
    if (exam.status === 'closed') return { label: 'Closed', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    if (exam.status === 'draft') return { label: 'Draft', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    const timeLeft = getTimeRemaining(exam.deadline);
    if (timeLeft.expired) return { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' };
    if (timeLeft.total < 3600000) return { label: 'Ending Soon', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Active', color: 'bg-green-100 text-green-700 border-green-200' };
  };

  const filteredExams = exams.filter(exam => {
    if (filter === 'all') return true;
    if (filter === 'draft') return exam.status === 'draft';
    if (filter === 'closed') return exam.status === 'closed';
    if (filter === 'active') return exam.status === 'published' && !getTimeRemaining(exam.deadline).expired;
    if (filter === 'expired') return exam.status === 'published' && getTimeRemaining(exam.deadline).expired;
    return true;
  });

  const stats = {
    total: exams.length,
    drafts: exams.filter(e => e.status === 'draft').length,
    active: exams.filter(e => e.status === 'published' && !getTimeRemaining(e.deadline).expired).length,
    expired: exams.filter(e => e.status === 'published' && getTimeRemaining(e.deadline).expired).length,
    closed: exams.filter(e => e.status === 'closed').length,
  };

  return (
    <div className="w-full">
      <div className="flex-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Exams</h2>
          <p className="text-xs text-slate-500 mt-1">Manage, publish, and monitor your examinations.</p>
        </div>
        <button onClick={() => router.push('/teacher/create-exam')} className="btn btn-primary">
          Create New Exam
        </button>
      </div>

      <div className="flex overflow-x-auto bg-slate-100 p-0.5 rounded-lg border border-slate-200 mb-4 gap-0.5">
        {[
          { id: 'all', label: 'All' },
          { id: 'draft', label: 'Drafts' },
          { id: 'active', label: 'Active' },
          { id: 'expired', label: 'Expired' },
          { id: 'closed', label: 'Closed' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${filter === f.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {examLoading ? (
        <div className="spinner"><div className="spinner-circle"></div></div>
      ) : filteredExams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">No exams found</div>
          <h3>No Exams Found</h3>
          <p className="mb-4">{filter === 'all' ? 'Create your first exam to get started.' : 'No exams match this filter.'}</p>
          {filter === 'all' && (
            <button onClick={() => router.push('/teacher/create-exam')} className="btn btn-primary">
              Create Your First Exam
            </button>
          )}
        </div>
      ) : (
        <div className="tbl-wrapper">
          <table className="tbl exam-table">
            <thead>
              <tr>
                <th className="px-6 py-4">Exam Details</th>
                <th className="px-6 py-4">Questions</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Deadline</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExams.map((exam) => {
                const deadlineStatus = getExamDeadlineStatus(exam);
                return (
                  <tr key={exam.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-bold text-slate-900" data-label="Exam Details">
                      <div>
                        <span className="text-sm font-bold block">{exam.title}</span>
                        {exam.description && (
                          <span className="text-xs text-slate-400 font-light mt-0.5 block truncate max-w-xs">{exam.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium" data-label="Questions">
                      <span className="badge badge-gray">{exam.total_questions_pool || 0} Qs</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium" data-label="Duration">
                      <span className="badge badge-gray">{exam.duration_minutes} min</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-light" data-label="Deadline">
                      {formatDate(exam.deadline)}
                    </td>
                    <td className="px-6 py-4" data-label="Status">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${deadlineStatus.color}`}>
                        {deadlineStatus.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right" data-label="Actions">
                      <div className="flex justify-end gap-2">
                        {exam.status === 'draft' && (
                          <>
                            <button onClick={() => router.push(`/teacher/edit-exam/${exam.id}`)} className="btn btn-secondary btn-sm">
                              Edit
                            </button>
                            <button
                              onClick={() => handlePublish(exam.id)}
                              disabled={actionLoading[exam.id] === 'publish'}
                              className="btn btn-primary btn-sm"
                            >
                              {actionLoading[exam.id] === 'publish' ? 'Publishing...' : 'Publish'}
                            </button>
                          </>
                        )}
                        {exam.status === 'published' && (
                          <>
                            <button onClick={() => router.push(`/teacher/monitor/${exam.id}`)} className="btn btn-blue btn-sm relative">
                              Monitor
                              {liveCounts[exam.id] > 0 && (
                                <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse shadow-md">
                                  {liveCounts[exam.id]}
                                </span>
                              )}
                            </button>
                            <button onClick={() => router.push(`/teacher/edit-exam/${exam.id}`)} className="btn btn-secondary btn-sm">
                              Edit
                            </button>
                            <button onClick={() => router.push(`/teacher/results/${exam.id}`)} className="btn btn-purple btn-sm">
                              Results
                            </button>
                            <button
                              onClick={() => handleClose(exam.id)}
                              disabled={actionLoading[exam.id] === 'close'}
                              className="btn btn-danger-outline btn-sm"
                            >
                              {actionLoading[exam.id] === 'close' ? 'Closing...' : 'Close'}
                            </button>
                          </>
                        )}
                        {exam.status === 'closed' && (
                          <button onClick={() => router.push(`/teacher/results/${exam.id}`)} className="btn btn-purple btn-sm">
                            Results
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(exam.id)}
                          disabled={actionLoading[exam.id] === 'delete'}
                          className="btn btn-danger-outline btn-sm"
                        >
                          {actionLoading[exam.id] === 'delete' ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
