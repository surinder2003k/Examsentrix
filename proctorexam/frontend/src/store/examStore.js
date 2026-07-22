import { create } from 'zustand';
import { api } from '../utils/api';

const useExamStore = create((set, get) => ({
  // User state
  user: null,
  isLoading: false,
  error: null,

  // Exams
  exams: [],
  currentExam: null,
  examLoading: false,

  // Student exam
  studentExam: null,
  questions: [],
  responses: {},
  currentQuestionIndex: 0,
  markedForReview: new Set(),

  // Monitoring
  activeStudents: [],
  proctoringLogs: [],

  // Socket
  socket: null,
  isConnected: false,

  // Alert
  alert: null,

  // Actions
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Exam CRUD
  fetchExams: async () => {
    set({ examLoading: true });
    try {
      const data = await api.getExams();
      set({ exams: data.exams || [], examLoading: false });
    } catch (error) {
      set({ error: error.message, examLoading: false });
    }
  },

  fetchExam: async (id) => {
    set({ examLoading: true });
    try {
      const data = await api.getExam(id);
      set({ currentExam: data.exam, examLoading: false });
      return data.exam;
    } catch (error) {
      set({ error: error.message, examLoading: false });
      return null;
    }
  },

  createExam: async (examData) => {
    try {
      const data = await api.createExam(examData);
      set((state) => ({ exams: [data.exam, ...state.exams] }));
      return data.exam;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  updateExam: async (id, examData) => {
    try {
      const data = await api.updateExam(id, examData);
      set((state) => ({
        exams: state.exams.map(e => e.id === id ? data.exam : e),
        currentExam: data.exam,
      }));
      return data.exam;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  deleteExam: async (id) => {
    try {
      await api.deleteExam(id);
      set((state) => ({ exams: state.exams.filter(e => e.id !== id) }));
    } catch (error) {
      set({ error: error.message });
    }
  },

  publishExam: async (id) => {
    try {
      const data = await api.publishExam(id);
      set((state) => ({
        exams: state.exams.map(e => e.id === id ? data.exam : e),
        currentExam: data.exam,
      }));
      return data.exam;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  // Student exam actions
  assignExam: async (examId) => {
    try {
      const data = await api.assignExam(examId);
      set({ studentExam: data.studentExam });
      return data.studentExam;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  startExam: async (studentExamId) => {
    try {
      const data = await api.startExam(studentExamId);
      set({ studentExam: data.studentExam });
      return data.studentExam;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  submitExam: async (studentExamId) => {
    try {
      const data = await api.submitExam(studentExamId);
      return data;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  saveAnswer: async (studentExamId, questionId, answer) => {
    try {
      await api.saveAnswer(studentExamId, questionId, answer);
      set((state) => ({
        responses: { ...state.responses, [questionId]: answer }
      }));
    } catch (error) {
      console.error('Save answer error:', error);
    }
  },

  // Question navigation
  setQuestions: (questions) => set({ questions }),
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  toggleMarkForReview: (questionId) => {
    set((state) => {
      const newMarked = new Set(state.markedForReview);
      if (newMarked.has(questionId)) {
        newMarked.delete(questionId);
      } else {
        newMarked.add(questionId);
      }
      return { markedForReview: newMarked };
    });
  },
  setResponses: (responses) => set({ responses }),

  // Monitoring
  setActiveStudents: (students) => set({ activeStudents: students }),
  fetchActiveStudents: async (examId) => {
    try {
      const data = await api.getActiveStudents(examId);
      set({ activeStudents: data.students || [] });
    } catch (error) {
      console.error('Fetch active students error:', error);
    }
  },

  // Socket
  setSocket: (socket) => set({ socket }),
  setConnected: (isConnected) => set({ isConnected }),

  // Alert
  showAlert: (alert) => set({ alert }),
  clearAlert: () => set({ alert: null }),

  // Proctoring logs
  setProctoringLogs: (logs) => set({ proctoringLogs: logs }),

  // Reset
  resetExam: () => set({
    studentExam: null,
    questions: [],
    responses: {},
    currentQuestionIndex: 0,
    markedForReview: new Set(),
    alert: null,
  }),
}));

export default useExamStore;
