import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkRole } from '../middleware/roleCheck.js';

const router = Router();

// List exams (role-based)
router.get('/', authenticate, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { role, id: userId } = req.user;

  try {
    let query = supabase.from('exams').select('*');

    if (role === 'student') {
      query = query.eq('status', 'published').gte('deadline', new Date().toISOString());
    }
    // teacher and super_admin see all exams

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ exams: data });
  } catch (error) {
    console.error('List exams error:', error);
    return res.status(500).json({ error: 'Failed to list exams' });
  }
});

// Get exam details
router.get('/:id', authenticate, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Exam not found' });

    return res.json({ exam: data });
  } catch (error) {
    console.error('Get exam error:', error);
    return res.status(500).json({ error: 'Failed to get exam' });
  }
});

// Create exam (teacher only)
router.post('/', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { title, description, duration_minutes, deadline, result_publish_time, questions_per_student, passing_percentage, shuffle_questions } = req.body;

  if (!title || !duration_minutes || !deadline || !result_publish_time || !questions_per_student) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data, error } = await supabase
      .from('exams')
      .insert({
        title,
        description,
        created_by: req.user.id,
        duration_minutes,
        deadline,
        result_publish_time,
        total_questions_pool: 0,
        questions_per_student,
        passing_percentage: passing_percentage || 40,
        shuffle_questions: shuffle_questions !== false,
        status: 'draft'
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ exam: data });
  } catch (error) {
    console.error('Create exam error:', error);
    return res.status(500).json({ error: 'Failed to create exam' });
  }
});

// Update exam
router.put('/:id', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id } = req.params;
  const { title, description, duration_minutes, deadline, result_publish_time, passing_percentage, shuffle_questions } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
  if (deadline !== undefined) updates.deadline = deadline;
  if (result_publish_time !== undefined) updates.result_publish_time = result_publish_time;
  if (passing_percentage !== undefined) updates.passing_percentage = passing_percentage;
  if (shuffle_questions !== undefined) updates.shuffle_questions = shuffle_questions;

  try {
    // Verify ownership
    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data, error } = await supabase
      .from('exams')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ exam: data });
  } catch (error) {
    console.error('Update exam error:', error);
    return res.status(500).json({ error: 'Failed to update exam' });
  }
});

// Delete exam
router.delete('/:id', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id } = req.params;

  try {
    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // 1. Fetch student exams for this exam
    const { data: studentExams } = await supabase
      .from('student_exams')
      .select('id')
      .eq('exam_id', id);

    if (studentExams && studentExams.length > 0) {
      const studentExamIds = studentExams.map(se => se.id);
      
      // 3. Delete proctoring logs for these student exams
      await supabase
        .from('proctoring_logs')
        .delete()
        .in('student_exam_id', studentExamIds);

      // 4. Delete responses of those student exams
      await supabase
        .from('responses')
        .delete()
        .in('student_exam_id', studentExamIds);
    }

    // 5. Delete student exams
    await supabase
      .from('student_exams')
      .delete()
      .eq('exam_id', id);

    // 6. Delete questions of this exam
    await supabase
      .from('questions')
      .delete()
      .eq('exam_id', id);

    // 7. Finally delete the exam itself
    const { error: deleteError } = await supabase
      .from('exams')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return res.json({ message: 'Exam and all associated history/questions/logs deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    return res.status(500).json({ error: 'Failed to delete exam: ' + (error.message || error) });
  }
});

// Publish exam
router.post('/:id/publish', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const io = req.app.get('io');
  const { id } = req.params;

  try {
    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check if exam has questions
    const { count, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', id);

    if (countError) throw countError;
    if (count === 0) {
      return res.status(400).json({ error: 'Cannot publish exam without questions' });
    }

    const { data, error } = await supabase
      .from('exams')
      .update({ status: 'published', total_questions_pool: count })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Emit real-time event to all students
    io.emit('exam_published', { examId: id, exam: data });

    return res.json({ exam: data });
  } catch (error) {
    console.error('Publish exam error:', error);
    return res.status(500).json({ error: 'Failed to publish exam' });
  }
});

// Close exam
router.post('/:id/close', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const io = req.app.get('io');
  const { id } = req.params;

  try {
    // Verify ownership
    const { data: existing } = await supabase.from('exams').select('created_by').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (existing.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data, error } = await supabase
      .from('exams')
      .update({ status: 'closed' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Emit real-time event
    io.emit('exam_closed', { examId: id, exam: data });

    return res.json({ exam: data });
  } catch (error) {
    console.error('Close exam error:', error);
    return res.status(500).json({ error: 'Failed to close exam' });
  }
});

// Release results (manual override)
router.post('/:id/release-results', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { id } = req.params;

  try {
    // Verify ownership
    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data, error } = await supabase
      .from('exams')
      .update({ results_released: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ exam: data, message: 'Results released successfully!' });
  } catch (error) {
    console.error('Release results error:', error);
    return res.status(500).json({ error: 'Failed to release results' });
  }
});

export default router;