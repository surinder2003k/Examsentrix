'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useTabDetection } from '../../hooks/useTabDetection';
import { useKeyboardBlock } from '../../hooks/useKeyboardBlock';
import { useCountdown } from '../../hooks/useCountdown';
import { useWebRTC } from '../../hooks/useWebRTC';
import { API_BASE_URL } from '../../utils/constants';

export default function TakeExam() {
  const { studentExamId } = useParams();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const socket = useSocket();
  const { enterFullscreen, exitFullscreen, exitAttempts, isMobileFull } = useFullscreen();

  const [examStarted, setExamStarted] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [examData, setExamData] = useState(null);
  const [studentExam, setStudentExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [responses, setResponses] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [alert, setAlert] = useState(null);
  const [teacherMsg, setTeacherMsg] = useState(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Camera test state
  const [cameraStatus, setCameraStatus] = useState('idle'); // idle | testing | ready | error
  const [cameraError, setCameraError] = useState('');
  const cameraTestStreamRef = useRef(null);

  // For resumed exams that need camera verification
  const [needsCameraVerify, setNeedsCameraVerify] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const socketRef = useRef(null);
  const handleSubmitRef = useRef(null);
  const cameraInitRef = useRef(false);
  const examJoinedRef = useRef(false);
  const onExamJoinedRef = useRef(null);
  const reentryTimerRef = useRef(null);
  const autoSubmitTriggeredRef = useRef(false);
  const wasTabHiddenRef = useRef(false);

  useEffect(() => {
    socketRef.current = socket.socket;
  }, [socket.socket]);

  const { startCamera, stopCamera } = useWebRTC(socketRef, socket.socket);

  useKeyboardBlock(examStarted);

  const timer = useCountdown(
    examData?.duration_minutes || 0,
    studentExam?.started_at || null,
    () => handleSubmit(true)
  );

  useTabDetection(() => {
    if (examStarted) {
      setTabSwitchCount((prev) => prev + 1);
      socket.reportTabSwitch(studentExamId);
    }
  });

  // ─── Load exam ───────────────────────────────────────────────────────────
  useEffect(() => {
    const loadExam = async () => {
      try {
        const token = await getToken();
        api.setToken(token);

        const res = await fetch(`${API_BASE_URL}/api/monitoring/student-exams/${studentExamId}/take`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.status === 'completed') {
            router.push(`/student/results/${studentExamId}`);
            return;
          }
          setError(err.error || 'Failed to load exam');
          setLoading(false);
          return;
        }

        const data = await res.json();
        setStudentExam(data.studentExam);
        setExamData(data.studentExam?.exams || null);

        const ordered = (data.studentExam?.question_ids || [])
          .map((id) => data.questions.find((q) => q.id === id))
          .filter(Boolean);
        setQuestions(ordered);

        const savedResponses = {};
        (data.responses || []).forEach((r) => {
          savedResponses[r.question_id] = r.selected_answer;
        });
        setResponses(savedResponses);

        if (data.studentExam?.status === 'in_progress') {
          setNeedsCameraVerify(true);
        }
      } catch (err) {
        console.error('Load exam error:', err);
        setError('Failed to load exam. Please try again.');
      }
      setLoading(false);
    };

    loadExam();
  }, [studentExamId]);

  // ─── Camera test before exam ─────────────────────────────────────────────
  const testCamera = async () => {
    setCameraStatus('testing');
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      // Show preview
      cameraTestStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus('ready');
    } catch (err) {
      console.error('Camera test failed:', err);
      setCameraStatus('error');
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Please connect a camera and try again.'
            : `Camera error: ${err.message}`
      );
    }
  };

  const stopCameraTest = () => {
    if (cameraTestStreamRef.current) {
      cameraTestStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraTestStreamRef.current = null;
    }
  };

  // Run camera test on mount for pre-start screen
  useEffect(() => {
    if (!examStarted && !loading && !error) {
      testCamera();
    }
    return () => stopCameraTest();
  }, [loading, error, examStarted]);

  // ─── Active Exam Session Lifecycle ───────────────────────────────────────
  useEffect(() => {
    if (!examStarted || !studentExam || !examData || !user) return;
    if (cameraInitRef.current) return;
    cameraInitRef.current = true;
    examJoinedRef.current = false;

    // Stop the test stream, start real camera
    stopCameraTest();

    let isSubscribed = true;
    let frameInterval = null;
    let watchdogInterval = null;

    // Clear any previous interval to prevent duplicates
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    const initActiveSession = async () => {
      try {
        console.log('[TakeExam] Initializing active exam camera stream...');

        const mediaStream = await startCamera();

        if (!isSubscribed) {
          if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (!mediaStream) throw new Error('Camera access failed or denied');

        streamRef.current = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch((e) => console.error('Video play error:', e));
        }

        const onExamJoined = (data) => {
          if (!isSubscribed) return;
          console.log('[TakeExam] Server confirmed exam join:', data);
          examJoinedRef.current = true;
        };
        onExamJoinedRef.current = onExamJoined;
        socket.socket?.on('exam_joined', onExamJoined);

        // Join exam with retry until connected
        const attemptJoin = () => {
          if (!isSubscribed) return;
          if (socket.socket?.connected) {
            socket.joinExam({ studentExamId, userId: user.id, examId: examData.id });
          } else {
            // Retry in 500ms if not connected yet
            setTimeout(attemptJoin, 500);
          }
        };
        attemptJoin();

        // Send frames for teacher live view — HD quality, smooth cadence
        frameInterval = setInterval(() => {
          if (!examJoinedRef.current) return;
          if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const vw = video.videoWidth || 1280;
            const vh = video.videoHeight || 720;
            // Cap at 1280x720 for bandwidth, keep aspect ratio
            const maxW = 1280;
            const scale = Math.min(1, maxW / vw);
            const w = Math.round(vw * scale);
            const h = Math.round(vh * scale);
            const canvas = canvasRef.current;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);
            const frame = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            socket.sendCameraFrame(studentExamId, frame);
          }
        }, 3000);

        // Watchdog: if examJoinedRef is false for 10s, force re-join
        watchdogInterval = setInterval(() => {
          if (examJoinedRef.current || !isSubscribed) return;
          console.log('[TakeExam] Watchdog: exam_joined not confirmed, retrying join...');
          socket.socket?.off('exam_joined', onExamJoinedRef.current);
          socket.socket?.on('exam_joined', onExamJoined);
          onExamJoinedRef.current = onExamJoined;
          if (socket.socket?.connected) {
            socket.joinExam({ studentExamId, userId: user.id, examId: examData.id });
          }
        }, 10000);

        frameIntervalRef.current = frameInterval;
      } catch (err) {
        console.error('[TakeExam] Camera session error:', err);
        setAlert({
          message: 'Could not access camera. Please allow camera permissions and try again.',
          severity: 'high',
        });
      }
    };

    initActiveSession();

    // Force fullscreen on start
    enterFullscreen().catch(() => { });

    return () => {
      isSubscribed = false;
      cameraInitRef.current = false;
      examJoinedRef.current = false;
      if (frameInterval) clearInterval(frameInterval);
      if (watchdogInterval) clearInterval(watchdogInterval);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (onExamJoinedRef.current) socket.socket?.off('exam_joined', onExamJoinedRef.current);
      onExamJoinedRef.current = null;
      stopCamera();
    };
  }, [examStarted, studentExamId, user, examData]);

  // ─── Re-join socket room on reconnect ─────────────────────────────────────
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (!examStarted || !socket.isConnected || !examData?.id || !user?.id) {
      prevConnectedRef.current = socket.isConnected;
      return;
    }

    const wasDisconnected = !prevConnectedRef.current;
    prevConnectedRef.current = true;

    if (wasDisconnected) {
      examJoinedRef.current = false;
      console.log('[TakeExam] Socket reconnected — re-joining exam room...');
    } else {
      console.log('[TakeExam] Exam data loaded — joining exam room...');
    }

    socket.joinExam({ studentExamId, userId: user.id, examId: examData.id });
  }, [examStarted, socket.isConnected, examData?.id, user?.id]);

  // ─── Focus alerts from server ────────────────────────────────────────────
  useEffect(() => {
    if (!socket.socket) return;
    const timers = [];
    const onFocusAlert = (data) => {
      // Use AI's specific observation in the alert
      const alertMsg = data.observation ? `${data.message}\n\n📹 Detected: ${data.observation}` : data.message;
      setAlert({ message: alertMsg, severity: data.severity || 'medium' });
      // Keep high-severity alerts longer
      const duration = data.severity === 'high' ? 8000 : 5000;
      timers.push(setTimeout(() => setAlert(null), duration));
    };
    const onTeacherMessage = (data) => {
      setTeacherMsg(data);
      timers.push(setTimeout(() => setTeacherMsg(null), 8000));
    };
    const onExamEnded = (data) => {
      setAlert({ message: data.reason || 'Exam has ended.', severity: 'high' });
      timers.push(setTimeout(() => {
        router.push(`/student/results/${studentExamId}`);
      }, 3000));
    };

    socket.socket.on('focus_alert', onFocusAlert);
    socket.socket.on('teacher_message', onTeacherMessage);
    socket.socket.on('exam_ended', onExamEnded);

    return () => {
      timers.forEach(clearTimeout);
      socket.socket?.off('focus_alert', onFocusAlert);
      socket.socket?.off('teacher_message', onTeacherMessage);
      socket.socket?.off('exam_ended', onExamEnded);
    };
  }, [socket.socket, studentExamId, router]);

  // ─── Start exam ───────────────────────────────────────────────────────────
  const handleStartExam = async () => {
    if (cameraStatus !== 'ready') {
      setAlert({ message: 'Camera must be working before you can start the exam.', severity: 'high' });
      return;
    }
    try {
      await enterFullscreen();
      const token = await getToken();
      api.setToken(token);
      const startRes = await api.startExam(studentExamId);
      if (startRes?.studentExam) setStudentExam(startRes.studentExam);
      setExamStarted(true);
    } catch (err) {
      console.error('Start exam interaction error:', err);
      setAlert({ message: 'Could not start exam. Fullscreen or server access denied.', severity: 'high' });
    }
  };

  const handleAnswer = async (questionId, answerIndex) => {
    setResponses((prev) => ({ ...prev, [questionId]: answerIndex }));
    try {
      await api.saveAnswer(studentExamId, questionId, answerIndex);
    } catch (e) {
      console.error('Save answer HTTP error:', e);
    }
  };

  const toggleReview = (questionId) => {
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  // ─── Submit exam ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (autoSubmit = false) => {
      if (submitting) return;
      setSubmitting(true);

      try {
        if (autoSubmit) {
          if (socket.socket?.connected) {
            socket.requestSubmit(studentExamId);
          } else {
            await api.submitExam(studentExamId);
          }
        } else {
          await api.submitExam(studentExamId);
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        clearInterval(frameIntervalRef.current);

        // Clean up mobile fullscreen class
        document.body.classList.remove('exam-fullscreen');

        // Auto-submit (fullscreen exit) → dashboard, manual submit → results
        router.push(autoSubmit ? '/dashboard' : `/student/results/${studentExamId}`);
      } catch (err) {
        console.error('Submit error:', err);
        setAlert({ message: 'Submit failed. Please try again.', severity: 'high' });
        setSubmitting(false);
      }
    },
    [submitting, studentExamId, socket, router]
  );

  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  // ─── Fullscreen exit handling ─────────────────────────────────────────────
  useEffect(() => {
    if (!examStarted || exitAttempts === 0) return;
    if (autoSubmitTriggeredRef.current) return;
    // Immediate auto-submit on ANY fullscreen exit (1st attempt onwards)
    autoSubmitTriggeredRef.current = true;
    setAlert({ message: 'Fullscreen exited — exam auto-submitted.', severity: 'high' });
    handleSubmitRef.current(true);
    return () => {
      if (reentryTimerRef.current) {
        clearTimeout(reentryTimerRef.current);
        reentryTimerRef.current = null;
      }
    };
  }, [exitAttempts, examStarted]);

  // ─── Loading / Error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-b-4 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading your exam...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">!</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Exam</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline font-medium">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Pre-start briefing screen with camera test ───────────────────────────
  if (!examStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{examData?.title}</h1>
              <p className="text-sm text-gray-500">ExamSentrix - Secure Examination</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{examData?.duration_minutes}</div>
              <div className="text-xs text-blue-500 font-medium">Minutes</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{questions.length}</div>
              <div className="text-xs text-purple-500 font-medium">Questions</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{examData?.passing_percentage}%</div>
              <div className="text-xs text-green-500 font-medium">Passing</div>
            </div>
          </div>

          {/* Camera test section */}
          <div className="mb-6">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Camera Test</p>
            <div className="rounded-xl overflow-hidden bg-gray-900 aspect-video relative">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {cameraStatus === 'testing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-center text-white">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2" />
                    <p className="text-xs font-medium">Testing camera...</p>
                  </div>
                </div>
              )}
              {cameraStatus === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-900/80">
                  <div className="text-center text-white px-4">
                    <div className="text-3xl mb-2">X</div>
                    <p className="text-xs font-medium">{cameraError}</p>
                  </div>
                </div>
              )}
              {cameraStatus === 'ready' && (
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Camera Working
                </div>
              )}
            </div>
            {cameraStatus === 'error' && (
              <button
                onClick={testCamera}
                className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
              >
                Retry Camera Test
              </button>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 space-y-2">
            <p className="text-amber-800 text-sm font-semibold">Important Instructions</p>
            {[
              'Camera access is required - AI monitoring is active',
              'You must remain in fullscreen during the exam',
              'Tab switching is tracked (5 switches = auto-submit)',
              'Exam auto-submits when time expires',
            ].map((item, i) => (
              <p key={i} className="text-amber-700 text-sm flex items-start gap-2">
                <span className="mt-0.5 shrink-0">*</span>
                <span>{item}</span>
              </p>
            ))}
          </div>

          <button
            id="start-exam-btn"
            onClick={handleStartExam}
            disabled={cameraStatus !== 'ready'}
            className={`w-full py-3.5 rounded-xl font-semibold text-base transition shadow-lg ${cameraStatus === 'ready'
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
          >
            {cameraStatus === 'ready' ? 'Start Exam' : 'Camera Required to Start'}
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // ─── Active exam UI ───────────────────────────────────────────────────────
  const question = questions[currentQ];
  const answeredCount = Object.keys(responses).length;
  const isAnswered = (qId) => responses[qId] !== undefined;
  const isMarked = (qId) => markedForReview.has(qId);

  return (
    <div
      className={`min-h-screen bg-gray-100 select-none pb-12 ${isMobileFull ? 'exam-fullscreen-overlay' : ''}`}
      style={{ userSelect: 'none' }}>
      {/* Top Bar */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-sm md:text-base line-clamp-1">{examData?.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg font-medium shrink-0">
                {answeredCount}/{questions.length} answered
              </span>
              {tabSwitchCount > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded-lg font-bold shrink-0">
                  {tabSwitchCount} tab switch{tabSwitchCount > 1 ? 'es' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto border-t md:border-0 pt-2 md:pt-0">
            <div className="flex items-center gap-1.5 text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </div>

            <div
              id="exam-timer"
              className={`px-3 py-1 rounded-lg font-mono text-base font-bold tracking-tight transition ${timer.isCritical
                  ? 'bg-red-100 text-red-700 animate-pulse ring-2 ring-red-300'
                  : timer.isWarning
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
            >
              {timer.formatted}
            </div>

            <button
              id="submit-exam-btn"
              onClick={() => setShowSubmitModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition"
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alert && (
        <div
          className={`fixed top-20 right-4 z-50 max-w-sm rounded-xl shadow-xl px-5 py-4 text-white font-medium animate-in slide-in-from-right ${alert.severity === 'high' ? 'bg-red-600' : alert.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-600'
            }`}
        >
          {alert.message}
        </div>
      )}

      {teacherMsg && (
        <div className="fixed top-20 left-4 z-50 max-w-sm bg-purple-600 text-white px-5 py-4 rounded-xl shadow-xl animate-in slide-in-from-left">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">Teacher Message</p>
          <p>{teacherMsg.message}</p>
        </div>
      )}

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          {question && (
            <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  Question {currentQ + 1} <span className="text-gray-300">of</span> {questions.length}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${question.difficulty === 'easy' ? 'bg-green-100 text-green-700 border border-green-200'
                      : question.difficulty === 'hard' ? 'bg-red-100 text-red-700 border border-red-200'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}>
                    {question.difficulty}
                  </span>
                  {question.category && (
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold border border-gray-200">
                      {question.category}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                    {question.marks} mark{question.marks > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <h3 className="text-base md:text-lg font-bold text-gray-800 mb-6 leading-relaxed">
                {question.question_text}
              </h3>

              <div className="space-y-3">
                {question.options.map((option, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center p-3.5 md:p-4 rounded-xl border-2 cursor-pointer transition-all ${responses[question.id] === idx
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      checked={responses[question.id] === idx}
                      onChange={() => handleAnswer(question.id, idx)}
                      className="h-4 w-4 text-blue-600 shrink-0"
                    />
                    <span className={`ml-3 text-sm md:text-base ${responses[question.id] === idx ? 'text-blue-900 font-semibold' : 'text-gray-700 font-medium'
                      }`}>
                      {option}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-6 pt-5 border-t border-gray-100">
                <button
                  onClick={() => toggleReview(question.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${isMarked(question.id)
                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                    }`}
                >
                  {isMarked(question.id) ? 'Marked for Review' : 'Mark for Review'}
                </button>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setCurrentQ((p) => Math.max(0, p - 1))}
                    disabled={currentQ === 0}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 disabled:opacity-40 transition font-bold text-xs uppercase"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentQ((p) => Math.min(questions.length - 1, p + 1))}
                    disabled={currentQ === questions.length - 1}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition font-bold text-xs uppercase"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Question Palette Sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl shadow-sm p-4 relative lg:sticky lg:top-24 border border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Question Palette</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQ(idx)}
                  className={`w-10 h-10 rounded-lg text-xs font-bold transition ${currentQ === idx ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                    } ${isMarked(q.id) ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : isAnswered(q.id) ? 'bg-green-100 text-green-700 border border-green-200'
                        : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
              {[
                { color: 'bg-green-100 text-green-700 border-green-200', label: `Answered (${answeredCount})` },
                { color: 'bg-amber-100 text-amber-700 border-amber-200', label: `Review (${markedForReview.size})` },
                { color: 'bg-slate-50 text-slate-500 border-slate-200', label: `Not visited (${questions.length - answeredCount})` },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-6 h-4 rounded ${color} border`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your Camera Feed</p>
              <div className="rounded-lg overflow-hidden bg-gray-900 aspect-video">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Submit Exam?</h2>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Answered</span>
                <span className="font-semibold text-gray-900">{answeredCount} / {questions.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Marked for review</span>
                <span className="font-semibold text-amber-600">{markedForReview.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Time remaining</span>
                <span className={`font-semibold ${timer.isCritical ? 'text-red-600' : 'text-gray-900'}`}>
                  {timer.formatted}
                </span>
              </div>
            </div>
            {answeredCount < questions.length && (
              <p className="text-amber-600 text-sm mb-4 bg-amber-50 rounded-xl p-3 border border-amber-200">
                {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? 's are' : ' is'} unanswered.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Continue Exam
              </button>
              <button
                id="confirm-submit-btn"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-50 transition"
              >
                {submitting ? 'Submitting...' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

