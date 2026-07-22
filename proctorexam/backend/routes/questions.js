import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkRole } from '../middleware/roleCheck.js';
import { askAiAssistant } from '../services/aiAssist.js';

const router = Router();

// Get questions for an exam
router.get('/:examId/questions', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('created_at');

    if (error) throw error;
    return res.json({ questions: data });
  } catch (error) {
    console.error('List questions error:', error);
    return res.status(500).json({ error: 'Failed to list questions' });
  }
});

// Add single question
router.post('/:examId/questions', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;
  const { question_text, options, correct_answer, difficulty, marks, is_common, category } = req.body;

  if (!question_text || !options || correct_answer === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Verify exam ownership
    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data, error } = await supabase
      .from('questions')
      .insert({
        exam_id: examId,
        question_text,
        options,
        correct_answer,
        difficulty: difficulty || 'medium',
        marks: marks || 1,
        is_common: is_common || false,
        category
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ question: data });
  } catch (error) {
    console.error('Add question error:', error);
    return res.status(500).json({ error: 'Failed to add question' });
  }
});

// Update question
router.put('/:examId/questions/:questionId', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId, questionId } = req.params;

  try {
    // Verify exam ownership
    const { data: exam } = await supabase.from('exams').select('created_by').eq('id', examId).single();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const allowed = {};
    const { question_text, options, correct_answer, difficulty, marks, is_common, category } = req.body;
    if (question_text !== undefined) allowed.question_text = question_text;
    if (options !== undefined) allowed.options = options;
    if (correct_answer !== undefined) allowed.correct_answer = correct_answer;
    if (difficulty !== undefined) allowed.difficulty = difficulty;
    if (marks !== undefined) allowed.marks = marks;
    if (is_common !== undefined) allowed.is_common = is_common;
    if (category !== undefined) allowed.category = category;

    const { data, error } = await supabase
      .from('questions')
      .update(allowed)
      .eq('id', questionId)
      .eq('exam_id', examId)
      .select()
      .single();

    if (error) throw error;
    return res.json({ question: data });
  } catch (error) {
    console.error('Update question error:', error);
    return res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/:examId/questions/:questionId', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId, questionId } = req.params;

  try {
    // Verify exam ownership
    const { data: exam } = await supabase.from('exams').select('created_by').eq('id', examId).single();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', questionId)
      .eq('exam_id', examId);

    if (error) throw error;
    return res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Delete question error:', error);
    return res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Bulk upload questions (CSV/JSON)
router.post('/:examId/questions/bulk', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;
  const { questions } = req.body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Questions array required' });
  }

  try {
    const questionsToInsert = questions.map((q, i) => {
      if (!q.question_text && !q.question) {
        throw new Error(`Question ${i + 1}: question_text is required`);
      }
      const options = Array.isArray(q.options) && q.options.length >= 2
        ? q.options
        : [q.option1, q.option2, q.option3, q.option4].filter(Boolean);
      if (options.length < 2) {
        throw new Error(`Question ${i + 1}: at least 2 options required`);
      }
      const correctAnswer = typeof q.correct_answer === 'number' ? q.correct_answer : parseInt(q.correct_answer, 10);
      if (isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
        throw new Error(`Question ${i + 1}: correct_answer must be a valid option index (0-${options.length - 1})`);
      }
      const marks = parseInt(q.marks, 10) || 1;
      if (marks < 1) throw new Error(`Question ${i + 1}: marks must be at least 1`);

      return {
        exam_id: examId,
        question_text: q.question_text || q.question,
        options,
        correct_answer: correctAnswer,
        difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
        marks,
        is_common: q.is_common || false,
        category: q.category || null
      };
    });

    const { data, error } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (error) throw error;
    return res.status(201).json({ questions: data, count: data.length });
  } catch (error) {
    console.error('Bulk upload error:', error);
    return res.status(500).json({ error: 'Failed to bulk upload questions' });
  }
});

// AI Assistant for exam questions (add/change/delete via prompt)
const aiAbortControllers = new Map();

router.post('/:examId/questions/ai-assist', authenticate, checkRole('teacher', 'super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { examId } = req.params;
  const { prompt, currentQuestions } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // 1. Verify exam ownership
    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Cancel any previous AI request for this exam
    const existingController = aiAbortControllers.get(examId);
    if (existingController) existingController.abort();
    const controller = new AbortController();
    aiAbortControllers.set(examId, controller);

    // Clean up on client disconnect
    req.on('close', () => {
      controller.abort();
      aiAbortControllers.delete(examId);
    });

    // 2. Query AI to generate/update the questions
    console.log(`[AI Assist] Prompt: "${prompt}" for Exam: ${examId}`);
    const updatedQuestions = await askAiAssistant(prompt, currentQuestions || [], controller.signal);
    console.log(`[AI Assist] Successfully generated ${updatedQuestions.length} questions`);

    if (!updatedQuestions || updatedQuestions.length === 0) {
      return res.status(400).json({ error: 'AI-generated questions are empty. Try a more specific prompt.' });
    }

    // 3. Save OLD question IDs before inserting new ones
    const { data: oldQuestions } = await supabase
      .from('questions')
      .select('id')
      .eq('exam_id', examId);
    const oldIds = (oldQuestions || []).map(q => q.id);

    // 4. Insert the new questions FIRST (before deleting old ones)
    const questionsToInsert = updatedQuestions.map(q => ({
      exam_id: examId,
      question_text: q.question_text,
      options: q.options,
      correct_answer: q.correct_answer,
      difficulty: q.difficulty || 'medium',
      marks: q.marks || 1,
      is_common: q.is_common || false,
      category: q.category || null
    }));

    const { data, error: insertErr } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (insertErr) throw insertErr;

    // 5. Delete OLD questions (not the ones we just inserted)
    if (oldIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < oldIds.length; i += batchSize) {
        const batch = oldIds.slice(i, i + batchSize);
        const { error: deleteErr } = await supabase
          .from('questions')
          .delete()
          .in('id', batch);

        if (deleteErr) throw deleteErr;
      }
    }

    // 5. Update exam total questions pool count
    await supabase
      .from('exams')
      .update({ total_questions_pool: data.length })
      .eq('id', examId);

    aiAbortControllers.delete(examId);
    return res.json({ success: true, questions: data, count: data.length });
  } catch (error) {
    aiAbortControllers.delete(examId);
    if (error.name === 'AbortError' || error.message === 'Request cancelled') {
      console.log(`[AI Assist] Request cancelled for exam ${examId}`);
      return res.status(499).json({ error: 'cancelled' });
    }
    console.error('AI Assist questions error:', error);
    return res.status(500).json({ error: error.message || 'AI Assist failed to generate questions' });
  }
});

export default router;