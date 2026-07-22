'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useTabDetection } from '../../hooks/useTabDetection';
import { useKeyboardBlock } from '../../hooks/useKeyboardBlock';
import { useCountdown } from '../../hooks/useCountdown';
import { useSocket } from '../../hooks/useSocket';
import { useAIProctor } from '../../hooks/useAIProctor';
import QuestionCard from './QuestionCard';
import ExamTimer from './ExamTimer';
import FocusAlert from './FocusAlert';
import NavigationPanel from './NavigationPanel';
import SubmitConfirmation from './SubmitConfirmation';

export default function StudentExam({ studentExamId, exam }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusAlerts, setFocusAlerts] = useState([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const socketRef = useRef(null);

  const { enterFullscreen, exitFullscreen } = useFullscreen();
  useTabDetection(() => {
    if (examStarted) {
      setTabSwitchCount((prev) => prev + 1);
      socket?.emit('tab_switch', { studentExamId, count: (tabSwitchCount || 0) + 1 });
    }
  });
  const { blockKeys, unblockKeys } = useKeyboardBlock();

  const handleTimerEnd = useCallback(async () => {
    await handleSubmit(true);
  }, []);

  const { timeLeft, formattedTime } = useCountdown(exam?.duration_minutes || 0, null, handleTimerEnd);

  const { socket, connected } = useSocket();

  const onFrameAnalysis = useCallback((sid, frame) => {
    socket?.emit('camera_frame', { studentExamId: sid, frame });
  }, [socket, studentExamId]);
  const { startProctoring, stopProctoring, lastAlert } = useAIProctor(studentExamId, onFrameAnalysis, examStarted);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadQuestions();
        if (!cancelled) {
          setExamStarted(true);
          enterFullscreen().catch(() => {});
        }
      } catch (e) {
        console.error('Exam init error:', e);
      }
    };
    init();
    return () => {
      cancelled = true;
      exitFullscreen();
      unblockKeys();
      stopProctoring();
    };
  }, []);

  useEffect(() => {
    if (examStarted) {
      startProctoring();
    }
  }, [examStarted, startProctoring]);

  useEffect(() => {
    if (tabSwitchCount > 0 && tabSwitchCount <= 5) {
      socket?.emit('tab_switch', { studentExamId, count: tabSwitchCount });
    }
    if (tabSwitchCount >= 5) {
      handleSubmit(true, 'Tab switch limit exceeded');
    }
  }, [tabSwitchCount]);

  useEffect(() => {
    if (lastAlert) {
      setFocusAlerts(prev => [...prev, { ...lastAlert, time: Date.now() }]);
      setTimeout(() => {
        setFocusAlerts(prev => prev.filter(a => a.time !== lastAlert.time));
      }, 4000);
    }
  }, [lastAlert]);

  const loadQuestions = async () => {
    try {
      const token = await getToken();
      api.setToken(token);
      const studentExam = await api.getResults(studentExamId);
      const examData = await api.getExam(studentExam.exam_id);
      setQuestions(studentExam.questions || []);
      setExamStarted(true);
      setLoading(false);
    } catch (error) {
      console.error('Load questions error:', error);
      setLoading(false);
    }
  };

  const handleAnswer = async (questionId, answer) => {
    setResponses(prev => ({ ...prev, [questionId]: answer }));
    try {
      await api.saveAnswer(studentExamId, questionId, answer);
      socket?.emit('answer_question', { studentExamId, questionId, answer });
    } catch (error) {
      console.error('Save answer error:', error);
    }
  };

  const toggleReview = (questionId) => {
    setMarkedForReview(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const handleSubmit = useCallback(async (isAuto = false, reason = '') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      api.setToken(token);
      const data = await api.submitExam(studentExamId);
      if (socket?.connected) {
        socket.emit('request_submit', { studentExamId, autoSubmit: isAuto, reason });
      }
      stopProctoring();
      router.push(`/student/results/${studentExamId}`);
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitting(false);
    }
  }, [submitting, studentExamId, socket, stopProctoring, router, getToken, api]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading exam...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(responses).length;

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Alert Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {focusAlerts.map((alert, i) => (
          <FocusAlert key={alert.time} message={alert.message} severity={alert.severity} />
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-white">{exam?.title || 'Exam'}</h1>
            <ExamTimer timeLeft={timeLeft} formattedTime={formattedTime} />
          </div>
        </div>

        {/* Question Area */}
        <div className="flex-1 flex items-center justify-center p-8">
          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              index={currentIndex}
              total={questions.length}
              selectedAnswer={responses[currentQuestion.id]}
              onAnswer={(answer) => handleAnswer(currentQuestion.id, answer)}
              isMarked={markedForReview.has(currentQuestion.id)}
              onToggleReview={() => toggleReview(currentQuestion.id)}
            />
          )}
        </div>

        {/* Navigation Footer */}
        <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-6 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 hover:bg-gray-600 transition"
            >
              Previous
            </button>
            <span className="text-gray-400">
              Question {currentIndex + 1} of {questions.length}
            </span>
            {currentIndex === questions.length - 1 ? (
              <button
                onClick={() => setShowSubmit(true)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Submit
              </button>
            ) : (
              <button
                onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div className="w-72 bg-gray-800 border-l border-gray-700 p-4">
        <NavigationPanel
          total={questions.length}
          currentIndex={currentIndex}
          responses={responses}
          markedForReview={markedForReview}
          onNavigate={setCurrentIndex}
          answeredCount={answeredCount}
        />
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmit && (
        <SubmitConfirmation
          answeredCount={answeredCount}
          total={questions.length}
          onSubmit={() => handleSubmit(false)}
          onCancel={() => setShowSubmit(false)}
          loading={submitting}
        />
      )}
    </div>
  );
}

