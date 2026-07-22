import { analyzeFrame } from '../services/aiProctor.js';

async function finalizeSubmission(supabase, studentExamId, socket, reason) {
  const { data: studentExam } = await supabase
    .from('student_exams')
    .select('*, exams(*), responses(*)')
    .eq('id', studentExamId)
    .single();

  if (!studentExam) return { score: 0, percentage: 0 };
  if (studentExam.status === 'completed') return { score: studentExam.score || 0, percentage: studentExam.percentage || 0 };

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', studentExam.question_ids || []);

  let score = 0;
  if (questions && studentExam.responses) {
    const uniqueResponses = [];
    const seen = new Set();
    const responsesCopy = [...studentExam.responses].reverse();
    for (const r of responsesCopy) {
      if (!seen.has(r.question_id)) {
        seen.add(r.question_id);
        uniqueResponses.push(r);
      }
    }
    score = uniqueResponses.reduce((acc, response) => {
      const question = questions.find(q => q.id === response.question_id);
      if (question && response.selected_answer === question.correct_answer) {
        return acc + question.marks;
      }
      return acc;
    }, 0);
  }

  const totalMarks = questions ? questions.reduce((acc, q) => acc + (q.marks || 1), 0) : 0;
  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

  await supabase
    .from('student_exams')
    .update({ status: 'completed', submitted_at: new Date().toISOString(), score, percentage })
    .eq('id', studentExamId);

  if (socket) socket.emit('exam_submitted', { score, percentage });
  return { score, percentage };
}

export function setupSocketHandlers(io, supabase) {
  const examRooms = new Map();
  const studentSockets = new Map();
  const studentFrames = new Map(); // studentExamId -> latest base64 frame
  io.studentSockets = studentSockets;
  io.studentFrames = studentFrames;

  // Rate limiting maps
  const rateLimits = new Map(); // socketId -> { event: { count, lastReset } }
  const RATE_LIMIT_WINDOW = 60000; // 1 minute
  const RATE_LIMITS = {
    camera_frame: 30,      // 30 frames per minute max
    tab_switch: 10,        // 10 tab switches per minute max
    answer_question: 60,   // 60 answers per minute max
    request_submit: 5,     // 5 submit attempts per minute max
  };

  function checkRateLimit(socketId, event) {
    const limit = RATE_LIMITS[event];
    if (!limit) return true; // No limit for this event

    const now = Date.now();
    if (!rateLimits.has(socketId)) {
      rateLimits.set(socketId, {});
    }
    const socketLimits = rateLimits.get(socketId);

    if (!socketLimits[event] || now - socketLimits[event].lastReset > RATE_LIMIT_WINDOW) {
      socketLimits[event] = { count: 1, lastReset: now };
      return true;
    }

    socketLimits[event].count++;
    return socketLimits[event].count <= limit;
  }

  io.engine.on('connection', (socket) => {
    console.log('[Socket.IO] New connection:', socket.id, 'transport:', socket.transport.name);
  });

  io.on('connection', (socket) => {
    console.log('[SocketHandler] Client connected:', socket.id);

    socket.on('join_exam', async (data) => {
      try {
        const { studentExamId, userId, examId } = data;
        console.log('[SocketHandler] join_exam received:', { studentExamId, userId, examId });

        for (const [sid, info] of studentSockets.entries()) {
          if (info.studentExamId === studentExamId && sid !== socket.id) {
            studentSockets.delete(sid);
            console.log(`[SocketHandler] Cleaned stale socket ${sid} for student ${studentExamId}`);
          }
        }

        studentSockets.set(socket.id, { studentExamId, userId, examId, _lastAlertTime: 0 });

        await supabase
          .from('student_exams')
          .update({ socket_id: socket.id })
          .eq('id', studentExamId);

        socket.join(`exam:${examId}`);
        socket.join(`student:${studentExamId}`);

        if (!examRooms.has(examId)) examRooms.set(examId, new Set());
        examRooms.get(examId).add(socket.id);

        socket.emit('exam_joined', { studentExamId, examId });

        // Fetch student name + teacher info for notifications
        let studentName = 'A student';
        let teacherId = null;
        let examTitle = '';
        try {
          const { data: exam } = await supabase
            .from('exams')
            .select('created_by, title')
            .eq('id', examId)
            .single();
          if (exam) {
            teacherId = exam.created_by;
            examTitle = exam.title;
            const { data: studentUser } = await supabase
              .from('users')
              .select('name, email')
              .eq('id', userId)
              .single();
            studentName = studentUser?.name || studentUser?.email || 'A student';
          }
        } catch (notifyErr) {
          console.warn('[SocketHandler] Failed to fetch student/exam info:', notifyErr.message);
        }

        // Notify teacher on dashboard (personal room)
        if (teacherId) {
          io.to(`teacher:${teacherId}`).emit('student_started_exam', {
            examId,
            examTitle,
            studentName,
            studentExamId,
          });
        }

        // Notify monitor page (monitor room)
        io.to(`monitor:${examId}`).emit('student_started_exam', {
          examId,
          examTitle,
          studentName,
          studentExamId,
          userId,
        });

        // Also update online status
        io.to(`monitor:${examId}`).emit('student_online', {
          studentExamId, userId, socketId: socket.id, is_online: true
        });

        console.log(`[SocketHandler] Student ${userId} joined exam ${examId} (socket: ${socket.id})`);
      } catch (error) {
        console.error('[SocketHandler] join_exam error:', error);
      }
    });

    socket.on('teacher_monitor', async (data) => {
      const { examId } = data;

      // Verify teacher is authorized for this exam
      try {
        const { data: teacher } = await supabase
          .from('users')
          .select('role, id')
          .eq('clerk_id', (await supabase.auth.getUser()).data.user?.id)
          .maybeSingle();

        if (!teacher || (teacher.role !== 'teacher' && teacher.role !== 'super_admin')) {
          socket.emit('error', { message: 'Unauthorized: Only teachers can monitor exams' });
          return;
        }

        // For teachers (not super_admin), verify they own the exam
        if (teacher.role === 'teacher') {
          const { data: exam } = await supabase
            .from('exams')
            .select('created_by')
            .eq('id', examId)
            .single();

          if (!exam || exam.created_by !== teacher.id) {
            socket.emit('error', { message: 'Unauthorized: You can only monitor your own exams' });
            return;
          }
        }

        socket.join(`monitor:${examId}`);
        console.log(`Teacher ${teacher.id} joined monitoring room for exam ${examId}`);
      } catch (error) {
        console.error('Teacher monitor auth error:', error);
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    socket.on('join_teacher', (data) => {
      const { userId } = data;
      if (userId) {
        socket.join(`teacher:${userId}`);
        console.log(`[SocketHandler] Teacher joined notification room: ${userId}`);
      }
    });

    // Camera frame — broadcast to teacher IMMEDIATELY, AI in background
    socket.on('camera_frame', (data) => {
      const { studentExamId, frame } = data;

      if (!frame) return;
      if (!checkRateLimit(socket.id, 'camera_frame')) {
        console.warn(`[camera_frame] Rate limited for socket ${socket.id}`);
        return;
      }

      const socketInfo = studentSockets.get(socket.id);
      if (!socketInfo) {
        console.warn(`[camera_frame] No socketInfo for socket ${socket.id} — frame DROPPED`);
        return;
      }

      if (socketInfo.studentExamId !== studentExamId) {
        console.warn(`[camera_frame] studentExamId mismatch: socket has ${socketInfo.studentExamId}, data has ${studentExamId} — frame DROPPED`);
        return;
      }

      const roomKey = `monitor:${socketInfo.examId}`;
      const room = io.sockets.adapter.rooms.get(roomKey);
      const roomSize = room ? room.size : 0;

      if (roomSize === 0) {
        console.warn(`[camera_frame] Room ${roomKey} is EMPTY — no teacher listening!`);
      }

      // Store latest frame for HTTP polling fallback
      studentFrames.set(studentExamId, frame);

      // Broadcast frame to teacher RIGHT AWAY (non-blocking)
      io.to(roomKey).emit('student_frame', { studentExamId, frame });

      // AI analysis in background — do NOT block frame delivery
      const lastAiTime = socketInfo._lastAiTime || 0;
      const AI_COOLDOWN = 10000; // 10s between AI analyses
      if (Date.now() - lastAiTime < AI_COOLDOWN) return;
      socketInfo._lastAiTime = Date.now();

      analyzeFrame(frame).then(result => {
        // result: { status: "focused|suspicious|violation", confidence: 0-1, observation: "specific description", severity: "low|medium|high" }

        const si = studentSockets.get(socket.id);
        if (!si) return;

        // Only act on suspicious or violation (ignore focused)
        if (result.status === 'focused') return;
        if (result.confidence < 0.5) return; // Minimum confidence threshold

        // Track violations by observation category (use first 30 chars as key)
        const violationKey = result.observation.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (!si._violations) si._violations = {};
        if (!si._violations[violationKey]) {
          si._violations[violationKey] = { count: 0, lastTime: 0, observation: result.observation };
        }

        const violation = si._violations[violationKey];
        const now = Date.now();

        // Reset counter if same violation wasn't detected in last 30s
        if ((now - violation.lastTime) > 30000) {
          violation.count = 0;
        }

        violation.count++;
        violation.lastTime = now;

        // Progressive alert messages based on AI observation + count
        const baseMsg = result.observation;
        let message, severity;

        if (violation.count === 1) {
          message = `⚠️ ${baseMsg}. Please correct this immediately.`;
          severity = result.severity || 'medium';
        } else if (violation.count === 2) {
          message = `🔴 SECOND WARNING: ${baseMsg}. Exam will auto-submit on next violation.`;
          severity = 'high';
        } else {
          message = `🚫 EXAM AUTO-SUBMITTED: Repeated violation — ${baseMsg}.`;
          severity = 'high';
        }

        // Log to DB
        supabase
          .from('student_exams')
          .select('focus_alert_count')
          .eq('id', studentExamId)
          .single()
          .then(async ({ data: se }) => {
            const newCount = (se?.focus_alert_count || 0) + 1;

            await supabase
              .from('student_exams')
              .update({ focus_alert_count: newCount })
              .eq('id', studentExamId);

            await supabase.from('proctoring_logs').insert({
              student_exam_id: studentExamId,
              event_type: result.status,
              event_data: {
                confidence: result.confidence,
                violationCount: violation.count,
                observation: result.observation,
                severity: result.severity
              },
              severity
            }).then(() => { }).catch(err => console.error('[camera_frame] Log insert error:', err.message));

            // Send alert to student via room (more reliable than socket.emit)
            io.to(`student:${studentExamId}`).emit('focus_alert', {
              message,
              type: result.status,
              count: violation.count,
              severity,
              observation: result.observation
            });

            // Notify teacher
            io.to(`monitor:${si.examId}`).emit('proctoring_update', {
              studentExamId, userId: si.userId, event: result.status,
              confidence: result.confidence, violationCount: violation.count,
              observation: result.observation, severity,
              timestamp: new Date().toISOString()
            });

            // Auto-submit on 3rd violation of same type
            if (violation.count >= 3) {
              const { score, percentage } = await finalizeSubmission(supabase, studentExamId, socket, `Auto-submitted: repeated violations (${violation.count}x) - ${result.observation}`);
              socket.emit('exam_ended', { reason: `Auto-submitted: repeated violations (${violation.count}x) - ${result.observation}`, autoSubmit: true, score, percentage });
              io.to(`monitor:${si.examId}`).emit('student_submitted', { studentExamId, userId: si.userId });
            }
          })
          .catch(err => console.error('[camera_frame] AI processing error:', err.message));
      }).catch(err => console.error('[camera_frame] AI analysis error:', err.message));
    });

    socket.on('tab_switch', async (data) => {
      try {
        if (!checkRateLimit(socket.id, 'tab_switch')) {
          console.warn(`[tab_switch] Rate limited for socket ${socket.id}`);
          return;
        }
        const { studentExamId } = data;
        const socketInfo = studentSockets.get(socket.id);
        if (!socketInfo) return;

        const { data: studentExam } = await supabase
          .from('student_exams')
          .select('tab_switch_count, status')
          .eq('id', studentExamId)
          .single();

        if (!studentExam || studentExam.status === 'completed') return;

        const newCount = (studentExam?.tab_switch_count || 0) + 1;

        await supabase
          .from('student_exams')
          .update({ tab_switch_count: newCount })
          .eq('id', studentExamId);

        await supabase.from('proctoring_logs').insert({
          student_exam_id: studentExamId,
          event_type: 'tab_switch',
          event_data: { count: newCount },
          severity: newCount >= 5 ? 'high' : newCount >= 3 ? 'medium' : 'low'
        });

        if (newCount >= 5) {
          const { score, percentage } = await finalizeSubmission(supabase, studentExamId, socket, 'Auto-submitted due to multiple tab switches (5+)');
          socket.emit('exam_ended', { reason: 'Auto-submitted due to multiple tab switches (5+)', autoSubmit: true, score, percentage });
          io.to(`monitor:${socketInfo.examId}`).emit('student_submitted', { studentExamId, userId: socketInfo.userId, score, percentage });
        } else if (newCount >= 3) {
          socket.emit('focus_alert', {
            message: `Final warning! You have switched tabs ${newCount} times. One more switch will auto-submit your exam.`,
            type: 'tab_switch', count: newCount, severity: 'high'
          });
        } else {
          socket.emit('focus_alert', {
            message: `Warning! Tab switch detected (${newCount}/5). Continued switching will auto-submit.`,
            type: 'tab_switch', count: newCount, severity: 'medium'
          });
        }

        io.to(`monitor:${socketInfo.examId}`).emit('proctoring_update', {
          studentExamId, userId: socketInfo.userId, event: 'tab_switch',
          count: newCount, timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('tab_switch error:', error);
      }
    });

    socket.on('answer_question', async (data) => {
      try {
        if (!checkRateLimit(socket.id, 'answer_question')) {
          console.warn(`[answer_question] Rate limited for socket ${socket.id}`);
          return;
        }
        const { studentExamId, questionId, selectedAnswer } = data;
        const { data: examStatus } = await supabase
          .from('student_exams').select('status').eq('id', studentExamId).single();
        if (!examStatus || examStatus.status !== 'in_progress') return;

        const { data: existing } = await supabase
          .from('responses').select('*')
          .eq('student_exam_id', studentExamId).eq('question_id', questionId).maybeSingle();

        if (existing) {
          await supabase.from('responses').update({ selected_answer: selectedAnswer }).eq('id', existing.id);
        } else {
          await supabase.from('responses').insert({
            student_exam_id: studentExamId, question_id: questionId, selected_answer: selectedAnswer
          });
        }
        socket.emit('answer_saved', { questionId, selectedAnswer });
      } catch (error) {
        console.error('answer_question error:', error);
      }
    });

    socket.on('request_submit', async (data) => {
      try {
        if (!checkRateLimit(socket.id, 'request_submit')) {
          console.warn(`[request_submit] Rate limited for socket ${socket.id}`);
          return;
        }
        const { studentExamId } = data;
        const { data: studentExam } = await supabase
          .from('student_exams').select('*, exams(*), responses(*)').eq('id', studentExamId).single();
        if (!studentExam) return;
        if (studentExam.status === 'completed') {
          socket.emit('exam_submitted', { score: studentExam.score, percentage: studentExam.percentage });
          return;
        }
        await finalizeSubmission(supabase, studentExamId, socket, 'Student submitted');
        const { data: updated } = await supabase
          .from('student_exams').select('score, percentage').eq('id', studentExamId).single();
        const sInfo = studentSockets.get(socket.id);
        if (sInfo) {
          io.to(`monitor:${sInfo.examId}`).emit('student_submitted', {
            studentExamId, userId: sInfo.userId, score: updated?.score || 0, percentage: updated?.percentage || 0
          });
        }
      } catch (error) {
        console.error('request_submit error:', error);
      }
    });

    socket.on('send_message', async (data) => {
      try {
        const { studentExamId, message } = data;
        await supabase.from('student_exams').update({ teacher_message: message }).eq('id', studentExamId);
        const { data: studentExam } = await supabase
          .from('student_exams').select('socket_id').eq('id', studentExamId).single();
        if (studentExam?.socket_id) io.to(studentExam.socket_id).emit('teacher_message', { message });
        await supabase.from('proctoring_logs').insert({
          student_exam_id: studentExamId, event_type: 'teacher_message', event_data: { message }, severity: 'medium'
        });
      } catch (error) {
        console.error('send_message error:', error);
      }
    });

    socket.on('force_submit', async (data) => {
      try {
        const { studentExamId } = data;
        const { score, percentage } = await finalizeSubmission(supabase, studentExamId, socket, 'Force submitted by teacher');

        const { data: studentExam } = await supabase
          .from('student_exams').select('socket_id').eq('id', studentExamId).single();

        if (studentExam?.socket_id) {
          io.to(studentExam.socket_id).emit('exam_ended', { reason: 'Teacher force submitted your exam', score, percentage });
        }
        await supabase.from('proctoring_logs').insert({
          student_exam_id: studentExamId, event_type: 'force_submit', event_data: { teacher_id: data.teacherId }, severity: 'high'
        });
      } catch (error) {
        console.error('force_submit error:', error);
      }
    });

    socket.on('request_video', (data) => {
      io.to(data.targetSocketId).emit('video_signal', { from: socket.id, signal: data.signal });
    });

    socket.on('video_signal', (data) => {
      io.to(data.targetSocketId).emit('video_signal', { from: socket.id, signal: data.signal });
    });

    socket.on('disconnect', async () => {
      const socketInfo = studentSockets.get(socket.id);
      if (socketInfo) {
        const { studentExamId, examId } = socketInfo;
        if (examRooms.has(examId)) {
          examRooms.get(examId).delete(socket.id);
          if (examRooms.get(examId).size === 0) examRooms.delete(examId);
        }
        io.to(`monitor:${examId}`).emit('student_online', { studentExamId, socketId: socket.id, is_online: false });
        io.to(`monitor:${examId}`).emit('student_left', { studentExamId, socketId: socket.id });

        // Notify teacher dashboard about student leaving
        try {
          const { data: exam } = await supabase
            .from('exams')
            .select('created_by')
            .eq('id', examId)
            .single();
          if (exam) {
            io.to(`teacher:${exam.created_by}`).emit('student_left_exam', {
              examId, studentExamId, userId: socketInfo.userId,
            });
          }
        } catch (e) { /* ignore */ }

        studentSockets.delete(socket.id);
        studentFrames.delete(studentExamId);
        console.log(`Student disconnected from exam ${examId}: ${socket.id}`);
      }
    });
  });
}
