'use client';
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import useExamStore from '../store/examStore';
import { SOCKET_URL } from '../utils/constants';

export function useSocket() {
  const socketRef = useRef(null);
  const setSocket = useExamStore((state) => state.setSocket);
  const setConnected = useExamStore((state) => state.setConnected);

  useEffect(() => {
    // Use polling-only for reliable connection through Next.js rewrites / Cloudflare tunnel
    const socket = io(SOCKET_URL, {
      transports: ['polling'], // Polling works through HTTP rewrites; WS upgrade fails
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
    });

    socket._pendingQueue = [];
    socket._lastQueued = null;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id, 'transport:', socket.io.engine.transport.name);
      setConnected(true);
      // Flush queued events
      const queue = socket._pendingQueue;
      for (const item of queue) {
        socket.emit(item.event, item.data);
      }
      queue.length = 0;
      socket._lastQueued = null;
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    setSocket(socket);
    socketRef.current = socket;

    return () => {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, []);

  const emit = useCallback((event, data) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(event, data);
    } else {
      // Queue critical events for when socket reconnects
      const queued = { event, data };
      const last = socket?._lastQueued;
      if (!last || last.event !== event || JSON.stringify(last.data) !== JSON.stringify(data)) {
        socket?._pendingQueue?.push(queued);
        socket._lastQueued = queued;
        console.warn('[Socket] Not connected, queuing:', event);
      }
    }
  }, []);

  const joinExam = useCallback(({ studentExamId, userId, examId }) => {
    emit('join_exam', { studentExamId, userId, examId });
  }, [emit]);

  const joinMonitoring = useCallback((examId) => {
    emit('teacher_monitor', { examId });
  }, [emit]);

  const sendCameraFrame = useCallback((studentExamId, frame) => {
    emit('camera_frame', { studentExamId, frame });
  }, [emit]);

  const reportTabSwitch = useCallback((studentExamId) => {
    emit('tab_switch', { studentExamId });
  }, [emit]);

  const sendAnswer = useCallback((studentExamId, questionId, selectedAnswer) => {
    emit('answer_question', { studentExamId, questionId, selectedAnswer });
  }, [emit]);

  const requestSubmit = useCallback((studentExamId) => {
    emit('request_submit', { studentExamId });
  }, [emit]);

  const sendMessageToStudent = useCallback((studentExamId, message) => {
    emit('send_message', { studentExamId, message });
  }, [emit]);

  const forceSubmitStudent = useCallback((studentExamId) => {
    emit('force_submit', { studentExamId });
  }, [emit]);

  const joinTeacher = useCallback((userId) => {
    emit('join_teacher', { userId });
  }, [emit]);

  const sendVideoSignal = useCallback((targetSocketId, signal) => {
    emit('video_signal', { targetSocketId, signal });
  }, [emit]);

  const socketState = useExamStore((state) => state.socket);
  const isConnected = useExamStore((state) => state.isConnected);

  return {
    socket: socketState,
    isConnected,
    joinExam,
    joinMonitoring,
    sendCameraFrame,
    reportTabSwitch,
    sendAnswer,
    requestSubmit,
    sendMessageToStudent,
    forceSubmitStudent,
    sendVideoSignal,
    joinTeacher,
    emit,
  };
}

