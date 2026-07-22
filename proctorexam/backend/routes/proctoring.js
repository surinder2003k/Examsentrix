import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkRole } from '../middleware/roleCheck.js';

const router = Router();

// List student's completed/assigned exam history (MUST be before :id routes)
router.get('/student-exams/my-exams', authenticate, checkRole('student'), async (req, res) => {
  const supabase = req.app.get('supabase');
  try {
    const { data, error } = await supabase
      .from('student_exams')
      .select('*, exams(*)')
      .eq('student_id', req.user.id)
      .order('started_at', { ascending: false });

    if (error) throw error;
    return res.json({ studentExams: data || [] });
  } catch (error) {
    console.error('List my exams error:', error);
    return res.status(500).json({ error: 'Failed to list exam history' });
  }
});

// ─── STUDENT: Get exam data for taking (strips correct_answer) ───────────────
router.get('/student-exams/:id/take', authenticate, checkRole('student'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id: studentExamId } = req.params;

  try {
    // Load the student exam record
    const { data: studentExam, error: seError } = await supabase
      .from('student_exams')
      .select('*, exams(*)')
      .eq('id', studentExamId)
      .eq('student_id', req.user.id)
      .maybeSingle();

    if (seError) throw seError;
    if (!studentExam) return res.status(404).json({ error: 'Student exam not found' });
    if (studentExam.status === 'completed') {
      return res.status(400).json({ error: 'Exam already completed', status: 'completed' });
    }

    // Load assigned questions – strip correct_answer for security
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id, exam_id, question_text, options, difficulty, marks, category')
      .in('id', studentExam.question_ids || []);

    if (qError) throw qError;

    // Load existing responses so student can resume
    const { data: responses } = await supabase
      .from('responses')
      .select('question_id, selected_answer')
      .eq('student_exam_id', studentExamId);

    return res.json({
      studentExam,
      questions: questions || [],
      responses: responses || [],
    });
  } catch (error) {
    console.error('Take exam error:', error);
    return res.status(500).json({ error: 'Failed to load exam' });
  }
});

// ─── TEACHER: Get ALL student results for an exam ────────────────────────────
router.get('/exams/:examId/results', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;

  try {
    const { data, error } = await supabase
      .from('student_exams')
      .select(`
        *,
        users!student_exams_student_id_fkey(id, name, email)
      `)
      .eq('exam_id', examId)
      .order('percentage', { ascending: false, nullsFirst: false });

    if (error) throw error;
    return res.json({ students: data });
  } catch (error) {
    console.error('Get exam results error:', error);
    return res.status(500).json({ error: 'Failed to get results' });
  }
});

// Get active students for an exam (teacher monitoring)
router.get('/:examId/students', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;

  try {
    const { data, error } = await supabase
      .from('student_exams')
      .select(`
        *,
        users!student_exams_student_id_fkey (id, name, email),
        exams!inner (*)
      `)
      .eq('exam_id', examId)
      .in('status', ['in_progress', 'assigned', 'completed'])
      .order('started_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    // Fetch live connection status
    const io = req.app.get('io');
    const studentSockets = io?.studentSockets;
    const studentFrames = io?.studentFrames;
    const onlineExamIds = new Set();

    if (studentSockets) {
      for (const [socketId, info] of studentSockets.entries()) {
        if (info.studentExamId) {
          onlineExamIds.add(info.studentExamId);
        }
      }
    }

    const studentsWithOnlineStatus = (data || []).map(student => ({
      ...student,
      is_online: onlineExamIds.has(student.id),
      last_frame: studentFrames?.get(student.id) || null
    }));

    return res.json({ students: studentsWithOnlineStatus });
  } catch (error) {
    console.error('Get active students error:', error);
    return res.status(500).json({ error: 'Failed to get active students' });
  }
});

// Real-time: Student joined exam room (emitted from socket handler)
router.post('/student-joined', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const io = req.app.get('io');
  const { studentExamId, examId, userId, socketId } = req.body;

  if (!studentExamId || !examId) {
    return res.status(400).json({ error: 'studentExamId and examId required' });
  }

  try {
    // Verify the student exam actually belongs to this exam
    const { data: studentExam } = await supabase
      .from('student_exams')
      .select('id, exam_id')
      .eq('id', studentExamId)
      .eq('exam_id', examId)
      .maybeSingle();

    if (!studentExam) {
      return res.status(403).json({ error: 'Invalid student exam for this exam' });
    }

    io.to(`monitor:${examId}`).emit('student_online', { studentExamId, socketId, is_online: true });
    return res.json({ success: true });
  } catch (error) {
    console.error('Student joined error:', error);
    return res.status(500).json({ error: 'Failed to process student join' });
  }
});

// Real-time: Student left exam room
router.post('/student-left', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const io = req.app.get('io');
  const { studentExamId, examId, socketId } = req.body;

  if (!studentExamId || !examId) {
    return res.status(400).json({ error: 'studentExamId and examId required' });
  }

  try {
    // Verify the student exam actually belongs to this exam
    const { data: studentExam } = await supabase
      .from('student_exams')
      .select('id, exam_id')
      .eq('id', studentExamId)
      .eq('exam_id', examId)
      .maybeSingle();

    if (!studentExam) {
      return res.status(403).json({ error: 'Invalid student exam for this exam' });
    }

    io.to(`monitor:${examId}`).emit('student_online', { studentExamId, socketId, is_online: false });
    io.to(`monitor:${examId}`).emit('student_left', { studentExamId, socketId });
    return res.json({ success: true });
  } catch (error) {
    console.error('Student left error:', error);
    return res.status(500).json({ error: 'Failed to process student leave' });
  }
});

// Send message to student
router.post('/message', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const io = req.app.get('io');
  const { studentExamId, message } = req.body;

  if (!studentExamId || !message) {
    return res.status(400).json({ error: 'studentExamId and message required' });
  }

  try {
    // Update teacher_message in student_exams
    const { data, error } = await supabase
      .from('student_exams')
      .update({ teacher_message: message })
      .eq('id', studentExamId)
      .select()
      .single();

    if (error) throw error;

    // Emit to student via socket
    if (data.socket_id) {
      io.to(data.socket_id).emit('teacher_message', { message, from: req.user.name });
    }

    // Log proctoring event
    await supabase
      .from('proctoring_logs')
      .insert({
        student_exam_id: studentExamId,
        event_type: 'teacher_message',
        event_data: { message, teacher_id: req.user.id },
        severity: 'medium'
      });

    return res.json({ success: true });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// Force submit student exam
router.post('/force-submit', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const io = req.app.get('io');
  const { studentExamId } = req.body;

  if (!studentExamId) {
    return res.status(400).json({ error: 'studentExamId required' });
  }

  try {
    // Get student exam
    const { data: studentExam } = await supabase
      .from('student_exams')
      .select('*, exams(*), users!student_exams_student_id_fkey(name)')
      .eq('id', studentExamId)
      .single();

    if (!studentExam) return res.status(404).json({ error: 'Student exam not found' });

    // Calculate score based on submitted answers
    const { data: responses } = await supabase
      .from('responses')
      .select('*, questions!inner(correct_answer, marks)')
      .eq('student_exam_id', studentExamId);

    let score = 0;
    if (responses) {
      // Deduplicate responses by question_id (keep latest)
      const uniqueResponses = [];
      const seen = new Set();
      const responsesCopy = [...responses].reverse();
      for (const r of responsesCopy) {
        if (!seen.has(r.question_id)) {
          seen.add(r.question_id);
          uniqueResponses.push(r);
        }
      }

      score = uniqueResponses.reduce((acc, r) => {
        if (r.selected_answer === r.questions.correct_answer) {
          return acc + r.questions.marks;
        }
        return acc;
      }, 0);
    }

    // Calculate total possible marks from assigned questions list
    const { data: assignedQs } = await supabase
      .from('questions')
      .select('marks')
      .in('id', studentExam.question_ids || []);

    const totalMarks = assignedQs ? assignedQs.reduce((acc, q) => acc + (q.marks || 1), 0) : 0;
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

    // Update status
    const { error } = await supabase
      .from('student_exams')
      .update({
        status: 'completed',
        submitted_at: new Date().toISOString(),
        score,
        percentage,
        teacher_message: 'Force submitted by teacher'
      })
      .eq('id', studentExamId);

    if (error) throw error;

    // Notify student
    if (studentExam.socket_id) {
      io.to(studentExam.socket_id).emit('exam_ended', { 
        reason: 'Teacher force submitted your exam',
        score, 
        percentage 
      });
    }

    // Log
    await supabase.from('proctoring_logs').insert({
      student_exam_id: studentExamId,
      event_type: 'force_submit',
      event_data: { teacher_id: req.user.id },
      severity: 'high'
    });

    return res.json({ success: true, score, percentage });
  } catch (error) {
    console.error('Force submit error:', error);
    return res.status(500).json({ error: 'Failed to force submit' });
  }
});

// Get proctoring logs for an exam
router.get('/:examId/logs', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;

  try {
    const { data, error } = await supabase
      .from('proctoring_logs')
      .select(`
        *,
        student_exams!inner(
          exam_id,
          users!student_exams_student_id_fkey(name)
        )
      `)
      .eq('student_exams.exam_id', examId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return res.json({ logs: data });
  } catch (error) {
    console.error('Get proctoring logs error:', error);
    return res.status(500).json({ error: 'Failed to get logs' });
  }
});

// Start student exam
router.post('/student-exams/:id/start', authenticate, checkRole('student'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id: studentExamId } = req.params;

  try {
    // Only start if still 'assigned' (prevent timer reset on double-click)
    const { data: existing } = await supabase
      .from('student_exams')
      .select('status')
      .eq('id', studentExamId)
      .eq('student_id', req.user.id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Student exam not found' });
    if (existing.status === 'completed') return res.status(400).json({ error: 'Exam already completed' });
    if (existing.status === 'in_progress') return res.json({ studentExam: existing });

    const { data: studentExam, error } = await supabase
      .from('student_exams')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', studentExamId)
      .eq('student_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ studentExam });
  } catch (error) {
    console.error('Start exam error:', error);
    return res.status(500).json({ error: 'Failed to start exam' });
  }
});

// Submit student exam
router.post('/student-exams/:id/submit', authenticate, checkRole('student'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id: studentExamId } = req.params;

  try {
    // Get student exam with questions
    const { data: studentExam } = await supabase
      .from('student_exams')
      .select('*, exams(*), responses(*)')
      .eq('id', studentExamId)
      .eq('student_id', req.user.id)
      .single();

    if (!studentExam) return res.status(404).json({ error: 'Student exam not found' });
    if (studentExam.status === 'completed') return res.status(400).json({ error: 'Already submitted' });

    // Calculate score
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .in('id', studentExam.question_ids || []);

    let score = 0;
    if (questions && studentExam.responses) {
      // Deduplicate responses by question_id (keep latest)
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

    // Update
    const { error } = await supabase
      .from('student_exams')
      .update({
        status: 'completed',
        submitted_at: new Date().toISOString(),
        score,
        percentage
      })
      .eq('id', studentExamId);

    if (error) throw error;

    return res.json({ success: true, score, percentage });
  } catch (error) {
    console.error('Submit exam error:', error);
    return res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// Save answer
router.post('/student-exams/:id/answer', authenticate, checkRole('student'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id: studentExamId } = req.params;
  const { questionId, selectedAnswer } = req.body;

  if (!questionId || selectedAnswer === undefined) {
    return res.status(400).json({ error: 'questionId and selectedAnswer required' });
  }

  try {
    // Upsert response
    const { data: existing } = await supabase
      .from('responses')
      .select('*')
      .eq('student_exam_id', studentExamId)
      .eq('question_id', questionId)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('responses')
        .update({ selected_answer: selectedAnswer })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ response: data });
    } else {
      const { data, error } = await supabase
        .from('responses')
        .insert({
          student_exam_id: studentExamId,
          question_id: questionId,
          selected_answer: selectedAnswer
        })
        .select()
        .single();

      if (error) throw error;
      return res.json({ response: data });
    }
  } catch (error) {
    console.error('Save answer error:', error);
    return res.status(500).json({ error: 'Failed to save answer' });
  }
});

// Get student exam results
router.get('/student-exams/:id/results', authenticate, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id: studentExamId } = req.params;

  try {
    const { data: studentExam } = await supabase
      .from('student_exams')
      .select('*, exams(*), responses(*)')
      .eq('id', studentExamId)
      .single();

    if (!studentExam) return res.status(404).json({ error: 'Student exam not found' });

    // Check permissions: student can see own, teacher can see theirs, or after publish/deadline/release
    const isOwner = studentExam.student_id === req.user.id;
    const isTeacher = req.user.role === 'teacher' || req.user.role === 'super_admin';
    
    const isPublished = !!studentExam.exams.results_released;

    if (!isOwner && !isTeacher) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (isOwner && !isPublished && !isTeacher) {
      return res.json({
        status: 'pending',
        message: 'Results are pending. They will be available after the deadline or when released by the teacher.',
        deadline: studentExam.exams.deadline,
        result_publish_time: studentExam.exams.result_publish_time
      });
    }

    // Get questions with correct answers for results
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .in('id', studentExam.question_ids || []);

    // If teacher/super_admin, also fetch proctoring logs for this student
    let proctoringLogs = [];
    if (isTeacher) {
      const { data: logs } = await supabase
        .from('proctoring_logs')
        .select('*')
        .eq('student_exam_id', studentExamId)
        .order('created_at', { ascending: false });
      proctoringLogs = logs || [];
    }

    return res.json({
      status: 'available',
      studentExam,
      questions,
      proctoringLogs
    });
  } catch (error) {
    console.error('Get results error:', error);
    return res.status(500).json({ error: 'Failed to get results' });
  }
});

// Assign exam to student (teacher or auto)
router.post('/student-exams/assign', authenticate, checkRole('student', 'teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.body;

  if (!examId) return res.status(400).json({ error: 'examId required' });

  try {
    // Check if already assigned
    const { data: existing } = await supabase
      .from('student_exams')
      .select('*')
      .eq('student_id', req.user.id)
      .eq('exam_id', examId)
      .maybeSingle();

    if (existing) {
      return res.json({ studentExam: existing });
    }

    // Call the database function to generate paper
    const { data, error } = await supabase.rpc('generate_student_paper', {
      p_student_id: req.user.id,
      p_exam_id: examId
    });

    if (error) throw error;

    // Fetch the created student exam
    const { data: studentExam } = await supabase
      .from('student_exams')
      .select('*')
      .eq('id', data)
      .single();

    return res.status(201).json({ studentExam });
  } catch (error) {
    console.error('Assign exam error:', error);
    return res.status(500).json({ error: 'Failed to assign exam' });
  }
});


export default router;