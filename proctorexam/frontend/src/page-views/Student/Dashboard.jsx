'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { formatDate, getTimeRemaining } from '../../utils/helpers';
import useExamStore from '../../store/examStore';
import { useSocket } from '../../hooks/useSocket';

export default function StudentDashboard() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { exams, examLoading, fetchExams, assignExam } = useExamStore();
  const socket = useSocket();
  
  const [activeTab, setActiveTab] = useState('available');
  const [myExams, setMyExams] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    fetchExams();
    loadHistory();
  }, []);

  // Real-time exam published updates
  useEffect(() => {
    if (!socket.socket) return;
    const onExamPublished = () => {
      fetchExams(); // Refresh available exams list
    };
    socket.socket.on('exam_published', onExamPublished);
    socket.socket.on('exam_closed', onExamPublished); // Same handler for closed exams
    return () => {
      socket.socket?.off('exam_published', onExamPublished);
      socket.socket?.off('exam_closed', onExamPublished);
    };
  }, [socket.socket, fetchExams]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const token = await getToken();
      api.setToken(token);
      const res = await api.getMyExams();
      setMyExams(res.studentExams || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
    setHistoryLoading(false);
  };

  const handleStartExam = async (examId) => {
    setActionLoading(prev => ({ ...prev, [examId]: true }));
    try {
      const token = await getToken();
      api.setToken(token);
      
      const studentExam = await assignExam(examId);
      if (studentExam) {
        router.push(`/student/take-exam/${studentExam.id}`);
      }
    } catch (error) {
      console.error('Start exam error:', error);
    }
    setActionLoading(prev => ({ ...prev, [examId]: false }));
  };

  // Check if student has already submitted or has an active paper for an exam
  const getExamEnrollment = (examId) => {
    return myExams.find(me => me.exam_id === examId);
  };

  // Filters exams that the student hasn't completed yet
  const availableExams = exams.filter(exam => {
    const enrollment = getExamEnrollment(exam.id);
    return !enrollment || enrollment.status !== 'completed';
  });

  return (
    <div className="w-full">
      {/* Navigation Tabs */}
      <div className="tabs mb-6">
        <button
          onClick={() => setActiveTab('available')}
          className={`tab ${activeTab === 'available' ? 'active' : ''}`}
        >
          📝 Active Exams
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
        >
          🏆 My Submissions
        </button>
      </div>

      {/* Tab 1: Available / In-Progress Exams */}
      {activeTab === 'available' && (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">Available Examinations</h2>
          {examLoading ? (
            <div className="spinner"><div className="spinner-circle"></div></div>
          ) : availableExams.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <h3>No Exams Available</h3>
              <p>There are no active tests matching your account permissions currently.</p>
            </div>
          ) : (
            <div className="grid-cards">
              {availableExams.map((exam) => {
                const timeLeft = getTimeRemaining(exam.deadline);
                const enrollment = getExamEnrollment(exam.id);
                const isInProgress = enrollment?.status === 'in_progress';

                return (
                  <div key={exam.id} className="card p-5 flex flex-col justify-between hover:shadow-md transition">
                    <div>
                      <div className="flex-between mb-2">
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{exam.title}</h3>
                        {isInProgress && (
                          <span className="badge badge-amber">
                            In Progress
                          </span>
                        )}
                      </div>
                      {exam.description && (
                        <p className="text-slate-500 text-xs mb-4 line-clamp-2 leading-relaxed">{exam.description}</p>
                      )}
                      
                      <div className="space-y-2 text-xs text-slate-600 mb-6 bg-slate-50 border border-slate-100 p-3 rounded-lg font-medium">
                        <div className="flex justify-between">
                          <span>Duration:</span>
                          <span className="text-slate-900 font-bold">{exam.duration_minutes} minutes</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Questions:</span>
                          <span className="text-slate-900 font-bold">{exam.questions_per_student} items</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Deadline:</span>
                          <span className="text-slate-900">{formatDate(exam.deadline)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Time Left:</span>
                          <span className={`font-bold ${timeLeft.expired ? 'text-red-500' : 'text-primary'}`}>
                            {timeLeft.expired ? 'Expired' : `${timeLeft.days > 0 ? timeLeft.days + 'd ' : ''}${timeLeft.hours}h ${timeLeft.minutes}m`}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        if (isInProgress) {
                          router.push(`/student/take-exam/${enrollment.id}`);
                        } else {
                          handleStartExam(exam.id);
                        }
                      }}
                      disabled={timeLeft.expired || actionLoading[exam.id]}
                      className={`btn btn-w-full py-2.5 ${
                        timeLeft.expired
                          ? 'btn-ghost'
                          : isInProgress
                          ? 'btn-blue'
                          : 'btn-primary'
                      }`}
                    >
                      {actionLoading[exam.id] ? 'Please wait...' : isInProgress ? 'Resume Exam ➜' : 'Start Exam'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Exam History & Results */}
      {activeTab === 'history' && (
        <div>
          <div className="flex-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Your Exam Submissions</h2>
            <button 
              onClick={loadHistory}
              className="btn btn-secondary btn-sm"
            >
              🔄 Refresh List
            </button>
          </div>
          
          {historyLoading ? (
            <div className="spinner"><div className="spinner-circle"></div></div>
          ) : myExams.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏆</div>
              <h3>No Submissions Found</h3>
              <p>You have not completed any exam papers yet.</p>
            </div>
          ) : (
            <div className="grid-cards">
              {myExams.map((enrollment) => {
                const exam = enrollment.exams;
                if (!exam) return null;

                const resultsReleased = !!exam.results_released;
                const isCompleted = enrollment.status === 'completed';

                return (
                  <div key={enrollment.id} className="card p-5 flex flex-col justify-between hover:shadow-md transition">
                    <div>
                      <div className="flex-between mb-2">
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{exam.title}</h3>
                        <span className={`badge ${
                          isCompleted ? 'badge-green' : 'badge-red'
                        }`}>
                          {enrollment.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[10px] mb-4 font-mono">Submission: {enrollment.id.substring(0, 8)}</p>
                      
                      <div className="space-y-2 text-xs text-slate-600 mb-6 bg-slate-50 border border-slate-100 p-3 rounded-lg font-medium">
                        <div className="flex justify-between">
                          <span>Score:</span>
                          <span className="text-slate-900 font-bold">
                            {resultsReleased && isCompleted ? `${enrollment.score || 0} marks` : '🔒 Pending'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Percentage:</span>
                          <span className={`font-bold ${
                            !resultsReleased || !isCompleted
                              ? 'text-slate-900'
                              : enrollment.percentage >= exam.passing_percentage
                              ? 'text-primary'
                              : 'text-red-500'
                          }`}>
                            {resultsReleased && isCompleted ? `${Math.round(enrollment.percentage || 0)}%` : '🔒 Pending'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Result Status:</span>
                          <span className="font-bold">
                            {!isCompleted ? (
                              <span className="text-red-500">Incomplete</span>
                            ) : resultsReleased ? (
                              enrollment.percentage >= exam.passing_percentage ? (
                                <span className="text-primary">Passed</span>
                              ) : (
                                <span className="text-red-500">Failed</span>
                              )
                            ) : (
                              <span className="text-amber-600">Pending Release</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isCompleted ? (
                      resultsReleased ? (
                        <button
                          onClick={() => router.push(`/student/results/${enrollment.id}`)}
                          className="btn btn-primary btn-w-full"
                        >
                          View Detailed Results ➜
                        </button>
                      ) : (
                        <div className="alert alert-warning py-2 text-center text-xs block font-bold">
                          ⏳ Scores Hidden Until Release
                        </div>
                      )
                    ) : (
                      <div className="alert alert-danger py-2 text-center text-xs block font-bold">
                        ⚠️ Test Incomplete
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

