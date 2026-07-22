'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { formatDate } from '../../utils/helpers';
import { API_BASE_URL } from '../../utils/constants';

export default function StudentResults() {
  const { studentExamId } = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const token = await getToken();
        api.setToken(token);
        const res = await fetch(`${API_BASE_URL}/api/monitoring/student-exams/${studentExamId}/results`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          setResult(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setResult(data);
      } catch (error) {
        console.error('Fetch results error:', error);
      }
      setLoading(false);
    };
    fetchResults();
  }, [studentExamId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">Result not found.</p>
          <button onClick={() => router.push('/dashboard')} className="mt-4 text-primary-600 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (result.status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-4xl mb-4">📋</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Exam Submitted!</h1>
          <p className="text-gray-600 mb-4">{result.message}</p>
          <p className="text-sm text-gray-500">Results will be available on: {formatDate(result.result_publish_time)}</p>
          <button onClick={() => router.push('/dashboard')} className="mt-6 text-primary-600 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { studentExam, questions } = result;
  if (!studentExam || !studentExam.exams) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">Result data is incomplete.</p>
          <button onClick={() => router.push('/dashboard')} className="mt-4 text-primary-600 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  const passed = studentExam.percentage >= studentExam.exams.passing_percentage;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Exam Results</h1>
          <button onClick={() => router.push('/dashboard')} className="text-primary-600 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Score Card */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{studentExam.exams.title}</h2>
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-bold mb-4 ${
            passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {passed ? '✅ Passed' : '❌ Failed'}
          </div>
          <div className="flex justify-center gap-12 mb-4">
            <div>
              <div className="text-4xl font-bold text-gray-900">{studentExam.score}</div>
              <div className="text-sm text-gray-500">Score</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">{Math.round(studentExam.percentage)}%</div>
              <div className="text-sm text-gray-500">Percentage</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">{studentExam.exams.passing_percentage}%</div>
              <div className="text-sm text-gray-500">Passing</div>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Submitted: {formatDate(studentExam.submitted_at)}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{studentExam.tab_switch_count || 0}</div>
            <div className="text-sm text-gray-500">Tab Switches</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{studentExam.focus_alert_count || 0}</div>
            <div className="text-sm text-gray-500">Focus Alerts</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{questions?.length || 0}</div>
            <div className="text-sm text-gray-500">Questions</div>
          </div>
        </div>

        {/* Question-wise Breakdown */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Question-wise Breakdown</h3>
          <div className="space-y-4">
            {questions?.map((q, idx) => {
              const response = studentExam.responses?.find(r => r.question_id === q.id);
              const isCorrect = response?.selected_answer === q.correct_answer;
              return (
                <div key={q.id} className={`p-4 rounded-lg border ${
                  isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-gray-700">Q{idx + 1}</span>
                    <span className={`text-sm font-medium ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                      {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                    </span>
                  </div>
                  <p className="text-gray-800 mb-2">{q.question_text}</p>
                  <div className="text-sm space-y-1">
                    <p>Your answer: <span className="font-medium">{response?.selected_answer !== undefined ? q.options[response.selected_answer] : 'Not answered'}</span></p>
                    {!isCorrect && (
                      <p>Correct answer: <span className="font-medium text-green-600">{q.options[q.correct_answer]}</span></p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

