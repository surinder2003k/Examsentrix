'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ExamSettings from './ExamSettings';
import QuestionBank from './QuestionBank';
import BulkUpload from './BulkUpload';
import { showAlert } from '../AlertModal';

const examSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  duration_minutes: z.number().min(1, 'Duration must be at least 1 minute'),
  deadline: z.string().min(1, 'Deadline is required'),
  result_publish_time: z.string().min(1, 'Result time is required'),
  questions_per_student: z.number().min(1, 'At least 1 question per student'),
  passing_percentage: z.number().min(0).max(100),
  shuffle_questions: z.boolean().default(true),
});

export default function ExamCreator({ onSubmit, loading }) {
  const [questions, setQuestions] = useState([]);
  const [step, setStep] = useState('settings');

  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    resolver: zodResolver(examSchema),
    defaultValues: {
      shuffle_questions: true,
      passing_percentage: 40,
      questions_per_student: 30,
    }
  });

  const handleCreateExam = async (data) => {
    if (questions.length === 0) {
      showAlert({ title: 'Validation', message: 'Please add at least one question', severity: 'warning' });
      return;
    }
    await onSubmit({ ...data, questions });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-2 mb-8">
        {['settings', 'questions', 'review'].map(s => (
          <button key={s} onClick={() => setStep(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              step === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
            {s === 'settings' ? '1. Exam Settings' : s === 'questions' ? '2. Questions' : '3. Review'}
          </button>
        ))}
      </div>

      {step === 'settings' && (
        <ExamSettings register={register} errors={errors} watch={watch} />
      )}

      {step === 'questions' && (
        <div className="space-y-6">
          <QuestionBank questions={questions} setQuestions={setQuestions} />
          <div className="border-t pt-6">
            <BulkUpload onImport={(qs) => setQuestions(prev => [...prev, ...qs])} />
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="bg-white rounded-2xl p-8 border border-gray-200">
          <h3 className="text-xl font-bold mb-6">Review & Create Exam</h3>
          <div className="space-y-4 mb-6">
            <p><strong>Title:</strong> {watch('title')}</p>
            <p><strong>Duration:</strong> {watch('duration_minutes')} minutes</p>
            <p><strong>Questions:</strong> {questions.length} total</p>
            <p><strong>Per Student:</strong> {watch('questions_per_student')}</p>
          </div>
          <button onClick={handleSubmit(handleCreateExam)} disabled={loading}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Exam'}
          </button>
        </div>
      )}

      <div className="flex justify-between mt-8">
        {step !== 'settings' && (
          <button onClick={() => setStep(step === 'questions' ? 'settings' : 'questions')}
            className="px-6 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200">
            Previous
          </button>
        )}
        {step !== 'review' && (
          <button onClick={() => setStep(step === 'settings' ? 'questions' : 'review')}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 ml-auto">
            Next
          </button>
        )}
      </div>
    </div>
  );
}

