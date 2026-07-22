'use client';
import { API_BASE_URL } from './constants';

let _token = '';

export function setToken(token) {
  _token = token;
}

export function getCachedToken() {
  return _token;
}

async function getToken() {
  if (window.__get_clerk_token) {
    try {
      const token = await window.__get_clerk_token();
      if (token) {
        _token = token;
        return token;
      }
    } catch (e) {
      console.error('Error fetching dynamic Clerk token:', e);
    }
  }
  return _token || '';
}

async function request(endpoint, options = {}) {
  try {
    const token = await getToken();
    
    const { headers: optHeaders, body, ...restOptions } = options;
    
    const config = {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...optHeaders,
      },
    };

    if (body && typeof body === 'object') {
      config.body = JSON.stringify(body);
    } else if (body) {
      config.body = body;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to connect to server');
    }
    throw err;
  }
}

export const api = {
  setToken,
  getToken: getCachedToken,
  // Auth
  syncUser: (data) => request('/api/auth/sync', { method: 'POST', body: data }),
  getMe: () => request('/api/auth/me'),
  getUsers: () => request('/api/auth/users'),
  approveUser: (email, role) => request('/api/auth/approve-user', { method: 'POST', body: { email, role } }),
  disallowUser: (email) => request('/api/auth/disallow-user', { method: 'POST', body: { email } }),
  changeRole: (email, role) => request('/api/auth/change-role', { method: 'POST', body: { email, role } }),
  grantTeacher: (email) => request('/api/auth/grant-teacher', { method: 'POST', body: { email } }),
  revokeTeacher: (email) => request('/api/auth/revoke-teacher', { method: 'POST', body: { email } }),

  // Exams
  getExams: () => request('/api/exams'),
  getExam: (id) => request(`/api/exams/${id}`),
  createExam: (data) => request('/api/exams', { method: 'POST', body: data }),
  updateExam: (id, data) => request(`/api/exams/${id}`, { method: 'PUT', body: data }),
  deleteExam: (id) => request(`/api/exams/${id}`, { method: 'DELETE' }),
  publishExam: (id) => request(`/api/exams/${id}/publish`, { method: 'POST' }),
  closeExam: (id) => request(`/api/exams/${id}/close`, { method: 'POST' }),
  releaseResults: (id) => request(`/api/exams/${id}/release-results`, { method: 'POST' }),

  // Questions
  getQuestions: (examId) => request(`/api/exams/${examId}/questions`),
  addQuestion: (examId, data) => request(`/api/exams/${examId}/questions`, { method: 'POST', body: data }),
  updateQuestion: (examId, questionId, data) => request(`/api/exams/${examId}/questions/${questionId}`, { method: 'PUT', body: data }),
  deleteQuestion: (examId, questionId) => request(`/api/exams/${examId}/questions/${questionId}`, { method: 'DELETE' }),
  bulkUploadQuestions: (examId, questions) => request(`/api/exams/${examId}/questions/bulk`, { method: 'POST', body: { questions } }),
  aiAssistQuestions: (examId, prompt, currentQuestions) => request(`/api/exams/${examId}/questions/ai-assist`, { method: 'POST', body: { prompt, currentQuestions } }),

  // Student Exams
  assignExam: (examId) => request('/api/monitoring/student-exams/assign', { method: 'POST', body: { examId } }),
  takeExam: (id) => request(`/api/monitoring/student-exams/${id}/take`),
  startExam: (id) => request(`/api/monitoring/student-exams/${id}/start`, { method: 'POST' }),
  submitExam: (id) => request(`/api/monitoring/student-exams/${id}/submit`, { method: 'POST' }),
  saveAnswer: (studentExamId, questionId, selectedAnswer) =>
    request(`/api/monitoring/student-exams/${studentExamId}/answer`, { method: 'POST', body: { questionId, selectedAnswer } }),
  getResults: (studentExamId) => request(`/api/monitoring/student-exams/${studentExamId}/results`),
  getExamResults: (examId) => request(`/api/monitoring/exams/${examId}/results`),
  getMyExams: () => request('/api/monitoring/student-exams/my-exams'),

  // Monitoring
  getActiveStudents: (examId) => request(`/api/monitoring/${examId}/students`),
  sendMessage: (studentExamId, message) => request('/api/monitoring/message', { method: 'POST', body: { studentExamId, message } }),
  forceSubmit: (studentExamId) => request('/api/monitoring/force-submit', { method: 'POST', body: { studentExamId } }),
  getProctoringLogs: (examId) => request(`/api/monitoring/${examId}/logs`),
};
