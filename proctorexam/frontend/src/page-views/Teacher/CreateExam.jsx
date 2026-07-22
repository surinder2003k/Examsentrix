'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import useExamStore from '../../store/examStore';

export default function CreateExam() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { createExam } = useExamStore();
  // Default deadline to 24 hours from now, result publish to 25 hours
  const getDefaultDeadline = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  };
  const getDefaultResultTime = () => {
    const d = new Date(Date.now() + 25 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration_minutes: 60,
    deadline: getDefaultDeadline(),
    result_publish_time: getDefaultResultTime(),
    questions_per_student: 30,
    passing_percentage: 40,
    shuffle_questions: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const toLocalISO = (val) => {
    if (!val) return new Date().toISOString();
    const d = new Date(val);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = await getToken();
      api.setToken(token);

      const exam = await createExam({
        ...formData,
        deadline: toLocalISO(formData.deadline),
        result_publish_time: toLocalISO(formData.result_publish_time),
        duration_minutes: Number(formData.duration_minutes),
        questions_per_student: Number(formData.questions_per_student),
        passing_percentage: Number(formData.passing_percentage),
      });

      if (exam) {
        router.push(`/teacher/edit-exam/${exam.id}`);
      } else {
        setError('Failed to create exam');
      }
    } catch (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Navigation Header */}
      <nav className="site-nav">
        <div className="inner">
          <div className="nav-logo">
            <div className="nav-logo-icon">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="nav-logo-text">ExamSentrix Setup</span>
          </div>
          <div className="nav-right">
            <button onClick={() => router.push('/dashboard')} className="btn btn-secondary btn-sm bg-white border border-slate-300 text-slate-700">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Form Workspace container */}
      <div className="page max-w-3xl flex-1 flex flex-col gap-6 justify-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Create New Exam Session</h1>
          <p className="text-xs text-slate-500 mt-1">Configure security levels, duration, and access parameters.</p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <span className="font-bold">Error:</span> {error}
          </div>
        )}

        <div className="card">
          <div className="card-body">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Exam Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  className="form-control"
                  placeholder="e.g. Advanced Data Structures Midterm"
                />
              </div>

              <div>
                <label className="form-label">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={2}
                  className="form-control"
                  placeholder="Enter guidelines, topics covered, or instructions for students..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Duration (minutes) *</label>
                  <input
                    type="number"
                    name="duration_minutes"
                    value={formData.duration_minutes}
                    onChange={handleChange}
                    required
                    min={1}
                    className="form-control"
                  />
                </div>

                <div>
                  <label className="form-label">Questions per Student *</label>
                  <input
                    type="number"
                    name="questions_per_student"
                    value={formData.questions_per_student}
                    onChange={handleChange}
                    required
                    min={1}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Deadline *</label>
                  <input
                    type="datetime-local"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleChange}
                    required
                    className="form-control"
                  />
                </div>

                <div>
                  <label className="form-label">Result Publish Time *</label>
                  <input
                    type="datetime-local"
                    name="result_publish_time"
                    value={formData.result_publish_time}
                    onChange={handleChange}
                    required
                    className="form-control"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Passing Percentage (%)</label>
                  <input
                    type="number"
                    name="passing_percentage"
                    value={formData.passing_percentage}
                    onChange={handleChange}
                    min={0}
                    max={100}
                    className="form-control"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2.5 cursor-pointer mt-4 select-none">
                    <input
                      type="checkbox"
                      name="shuffle_questions"
                      checked={formData.shuffle_questions}
                      onChange={handleChange}
                      className="h-4.5 w-4.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-600">Shuffle Questions for Students</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary btn-sm"
                >
                  {loading ? 'Creating...' : 'Create Exam & Proceed →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

