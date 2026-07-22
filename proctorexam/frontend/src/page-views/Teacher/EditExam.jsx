'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../utils/api';
import { parseCSVQuestions } from '../../utils/helpers';
import { showAlert, showConfirm } from '../../components/AlertModal';

export default function EditExam() {
  const { examId } = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [uploadingBulk, setUploadingBulk] = useState(false);

  // Question form
  const [questionForm, setQuestionForm] = useState({
    question_text: '',
    options: ['', '', '', ''],
    correct_answer: 0,
    difficulty: 'medium',
    marks: 1,
    is_common: false,
    category: '',
  });

  // AI assistant state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const aiAbortRef = useRef(null);
  const [aiLogs, setAiLogs] = useState([
    { sender: 'assistant', text: 'Hi! I am your AI Exam Assistant. Type or click the mic to instruct me. Say: "add 5 easy javascript questions" or "change the last question to a React topic".' }
  ]);

  // Speech Recognition setup
  const recognitionRef = React.useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setAiPrompt(transcript);
      };

      rec.onerror = (e) => {
        console.error('Speech recognition error:', e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      showAlert({ title: 'Not Supported', message: 'Speech recognition is not supported in this browser. Please use Chrome or Edge.', severity: 'warning' });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setAiPrompt('');
      recognitionRef.current.start();
    }
  };

  const handleAiSubmit = async (e, directPrompt = null) => {
    if (e) e.preventDefault();
    const promptToSend = directPrompt || aiPrompt;
    if (!promptToSend.trim()) return;

    setAiPrompt('');
    setAiLogs(prev => [...prev, { sender: 'user', text: promptToSend }]);
    setAiLoading(true);

    const controller = new AbortController();
    aiAbortRef.current = controller;

    try {
      const token = await getToken();
      const { API_BASE_URL } = await import('../../utils/constants');
      
      const res = await fetch(`${API_BASE_URL}/api/exams/${examId}/questions/ai-assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: promptToSend, currentQuestions: questions }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'cancelled') {
          setAiLogs(prev => [...prev, { sender: 'assistant', text: 'Generation stopped.' }]);
        } else {
          throw new Error(data.error || 'Request failed');
        }
      } else if (data.success) {
        setQuestions(data.questions || []);
        setAiLogs(prev => [...prev, { 
          sender: 'assistant', 
          text: `Done! Questions updated successfully. Total count: ${data.count || 0}.` 
        }]);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setAiLogs(prev => [...prev, { sender: 'assistant', text: 'Generation stopped.' }]);
      } else {
        console.error('AI assistant error:', err);
        setAiLogs(prev => [...prev, { 
          sender: 'assistant', 
          text: `Error: ${err.message || 'Failed to update questions.'}` 
        }]);
      }
    }
    aiAbortRef.current = null;
    setAiLoading(false);
  };

  const handleAiStop = () => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
  };

  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    title: '',
    description: '',
    duration_minutes: 30,
    deadline: '',
    result_publish_time: '',
    passing_percentage: 40,
    shuffle_questions: true,
  });

  useEffect(() => {
    loadData();
  }, [examId]);

  const loadData = async () => {
    try {
      const token = await getToken();
      api.setToken(token);

      const examRes = await api.getExam(examId);
      setExam(examRes.exam);
      if (examRes.exam) {
        setSettingsForm({
          title: examRes.exam.title || '',
          description: examRes.exam.description || '',
          duration_minutes: examRes.exam.duration_minutes || 30,
          deadline: examRes.exam.deadline ? new Date(examRes.exam.deadline).toISOString().slice(0, 16) : '',
          result_publish_time: examRes.exam.result_publish_time ? new Date(examRes.exam.result_publish_time).toISOString().slice(0, 16) : '',
          passing_percentage: examRes.exam.passing_percentage || 40,
          shuffle_questions: examRes.exam.shuffle_questions !== false,
        });
      }

      const qRes = await api.getQuestions(examId);
      setQuestions(qRes.questions || []);
    } catch (err) {
      console.error('Failed to load exam data:', err);
    }
    setLoading(false);
  };

  const toLocalISO = (val) => {
    if (!val) return new Date().toISOString();
    const d = new Date(val);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      const token = await getToken();
      api.setToken(token);

      const res = await api.updateExam(examId, {
        ...settingsForm,
        deadline: toLocalISO(settingsForm.deadline),
        result_publish_time: toLocalISO(settingsForm.result_publish_time),
      });

      if (res.exam) {
        setExam(res.exam);
        setShowSettings(false);
        showAlert({ title: 'Success', message: 'Exam configurations updated successfully!', severity: 'success' });
      }
    } catch (error) {
      showAlert({ title: 'Error', message: 'Failed to update exam configurations: ' + error.message, severity: 'error' });
    }
    setUpdatingSettings(false);
  };

  const handleQuestionChange = (field, val) => {
    setQuestionForm(prev => ({ ...prev, [field]: val }));
  };

  const handleOptionChange = (idx, val) => {
    setQuestionForm(prev => {
      const newOpts = [...prev.options];
      newOpts[idx] = val;
      return { ...prev, options: newOpts };
    });
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    setAddingQuestion(true);
    try {
      const token = await getToken();
      api.setToken(token);

      const res = await api.addQuestion(examId, questionForm);
      if (res.question) {
        setQuestions(prev => [...prev, res.question]);
        setQuestionForm({
          question_text: '',
          options: ['', '', '', ''],
          correct_answer: 0,
          difficulty: 'medium',
          marks: 1,
          is_common: false,
          category: '',
        });
        setShowAddForm(false);
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Failed to add question: ' + err.message, severity: 'error' });
    }
    setAddingQuestion(false);
  };

  const handleDeleteQuestion = async (qId) => {
    const confirmed = await showConfirm({ title: 'Delete Question', message: 'Delete this question?', confirmText: 'Delete', cancelText: 'Cancel', severity: 'danger' });
    if (!confirmed) return;
    try {
      const token = await getToken();
      api.setToken(token);

      await api.deleteQuestion(examId, qId);
      setQuestions(prev => prev.filter(q => q.id !== qId));
    } catch (err) {
      showAlert({ title: 'Error', message: 'Failed to delete question: ' + err.message, severity: 'error' });
    }
  };

  const handleBulkUpload = async () => {
    const parsed = parseCSVQuestions(csvText);
    if (parsed.length === 0) {
      showAlert({ title: 'Invalid CSV', message: 'Invalid CSV data. Please match the layout fields.', severity: 'warning' });
      return;
    }

    setUploadingBulk(true);
    try {
      const token = await getToken();
      api.setToken(token);

      const res = await api.bulkUploadQuestions(examId, parsed);
      if (res.questions) {
        setQuestions(prev => [...prev, ...(res.questions || [])]);
        setCsvText('');
        setShowBulkUpload(false);
        showAlert({ title: 'Success', message: `Successfully imported ${res.count || res.questions.length} questions.`, severity: 'success' });
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Failed bulk upload: ' + err.message, severity: 'error' });
    }
    setUploadingBulk(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="spinner"><div className="spinner-circle"></div></div>
      </div>
    );
  }

  const stats = {
    total: questions.length,
    common: questions.filter(q => q.is_common).length,
    easy: questions.filter(q => q.difficulty === 'easy').length,
    medium: questions.filter(q => q.difficulty === 'medium').length,
    hard: questions.filter(q => q.difficulty === 'hard').length,
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
            <span className="nav-logo-text">ExamSentrix Builder</span>
          </div>
          <div className="nav-right">
            <button onClick={() => router.push('/dashboard')} className="btn btn-secondary btn-sm bg-white border border-slate-300 text-slate-700">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Workspace Layout */}
      <div className="page flex-1 flex flex-col gap-6">
        
        {/* Title Block */}
        <div className="flex-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              {exam?.title || 'Edit Exam'}
              <span className={`badge ${exam?.status === 'published' ? 'badge-green' : 'badge-amber'}`}>
                {exam?.status}
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">Configure parameters, modify question pools, or generate questions via AI assistant.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowSettings(!showSettings)} className="btn btn-secondary btn-sm">
              ⚙️ Settings
            </button>
            <button onClick={() => setShowBulkUpload(!showBulkUpload)} className="btn btn-secondary btn-sm">
              📁 CSV Import
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-primary btn-sm">
              ➕ Add Question
            </button>
          </div>
        </div>

        {/* Collapsible Exam Settings Editor */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="card overflow-hidden"
            >
              <div className="card-header bg-slate-50">
                <span className="card-title">Edit Exam Information</span>
              </div>
              <div className="card-body">
                <form onSubmit={handleUpdateSettings} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Exam Title *</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.title}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, title: e.target.value }))}
                        className="form-control"
                      />
                    </div>
                    <div>
                      <label className="form-label">Duration (Minutes) *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={settingsForm.duration_minutes}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, duration_minutes: Number(e.target.value) }))}
                        className="form-control"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Exam Description</label>
                    <textarea
                      value={settingsForm.description}
                      rows={2}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, description: e.target.value }))}
                      className="form-control"
                      placeholder="Provide exam details/guidelines..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="form-label">Deadline *</label>
                      <input
                        type="datetime-local"
                        required
                        value={settingsForm.deadline}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, deadline: e.target.value }))}
                        className="form-control"
                      />
                    </div>
                    <div>
                      <label className="form-label">Auto-Publish Results Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={settingsForm.result_publish_time}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, result_publish_time: e.target.value }))}
                        className="form-control"
                      />
                    </div>
                    <div>
                      <label className="form-label">Passing Percentage (%)</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={settingsForm.passing_percentage}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, passing_percentage: Number(e.target.value) }))}
                        className="form-control"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updatingSettings}
                      className="btn btn-primary btn-sm"
                    >
                      {updatingSettings ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsible Bulk CSV Editor */}
        <AnimatePresence>
          {showBulkUpload && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="card overflow-hidden"
            >
              <div className="card-header bg-slate-50">
                <span className="card-title">Bulk CSV Import</span>
              </div>
              <div className="card-body">
                <p className="text-[11px] text-slate-500 mb-3 font-mono bg-slate-100 p-2.5 rounded border border-slate-200">
                  Headers structure required: question, option1, option2, option3, option4, correct_answer(0-3), difficulty(easy/medium/hard), is_common(true/false), marks, category
                </p>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={4}
                  className="form-control font-mono text-xs mb-4"
                  placeholder="What is 2+2?,1,2,3,4,3,easy,false,1,Math&#10;What is the capital of France?,London,Paris,Berlin,Madrid,1,medium,true,2,Geography"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowBulkUpload(false)} className="btn btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button onClick={handleBulkUpload} disabled={uploadingBulk} className="btn btn-primary btn-sm">
                    {uploadingBulk ? 'Uploading...' : 'Upload Questions'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsible Manual Question Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="card overflow-hidden"
            >
              <div className="card-header bg-slate-50">
                <span className="card-title">Add New Question</span>
              </div>
              <div className="card-body">
                <form onSubmit={handleAddQuestion} className="space-y-4">
                  <div>
                    <label className="form-label">Question Text *</label>
                    <textarea
                      value={questionForm.question_text}
                      onChange={(e) => handleQuestionChange('question_text', e.target.value)}
                      required
                      rows={2}
                      className="form-control"
                      placeholder="Enter the question text here..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {questionForm.options.map((opt, idx) => (
                      <div key={idx}>
                        <label className="form-label text-[10px] text-slate-500">Option {idx + 1}</label>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                          required
                          className="form-control text-sm py-1.5"
                          placeholder={`Choice ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="form-label">Correct Option *</label>
                      <select
                        value={questionForm.correct_answer}
                        onChange={(e) => handleQuestionChange('correct_answer', Number(e.target.value))}
                        className="form-control py-2 text-sm cursor-pointer"
                      >
                        <option value={0}>Option 1</option>
                        <option value={1}>Option 2</option>
                        <option value={2}>Option 3</option>
                        <option value={3}>Option 4</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Difficulty</label>
                      <select
                        value={questionForm.difficulty}
                        onChange={(e) => handleQuestionChange('difficulty', e.target.value)}
                        className="form-control py-2 text-sm cursor-pointer"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Marks</label>
                      <input
                        type="number"
                        value={questionForm.marks}
                        onChange={(e) => handleQuestionChange('marks', Number(e.target.value))}
                        min={1}
                        className="form-control py-1.5"
                      />
                    </div>
                    <div>
                      <label className="form-label">Category</label>
                      <input
                        type="text"
                        value={questionForm.category}
                        onChange={(e) => handleQuestionChange('category', e.target.value)}
                        className="form-control py-1.5"
                        placeholder="e.g. Science"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4 border-t border-slate-100">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={questionForm.is_common}
                        onChange={(e) => handleQuestionChange('is_common', e.target.checked)}
                        className="h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-xs text-slate-600">Common Question (mandatory for all students)</span>
                    </label>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary btn-sm">
                        Cancel
                      </button>
                      <button type="submit" disabled={addingQuestion} className="btn btn-primary btn-sm">
                        {addingQuestion ? 'Saving...' : 'Add Question'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Split Layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* LEFT: Questions list & Stats */}
          <div className="flex-1 w-full flex flex-col gap-6">
            
            {/* Stats Summary */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {[
                { label: 'Total', value: stats.total, color: 'text-slate-800' },
                { label: 'Common', value: stats.common, color: 'text-purple' },
                { label: 'Easy', value: stats.easy, color: 'text-primary' },
                { label: 'Medium', value: stats.medium, color: 'text-amber-600' },
                { label: 'Hard', value: stats.hard, color: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="stat-card text-center p-3">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Questions Bank List */}
            <div className="card">
              <div className="card-header bg-slate-50 border-b border-slate-100 py-3">
                <span className="card-title text-sm">Exam Question Bank ({questions.length})</span>
              </div>
              
              {questions.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📄</div>
                  <h3>No questions configured</h3>
                  <p>Build your question bank manually, run a bulk CSV file import, or use the AI generator.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="p-5 hover:bg-slate-50/50 transition duration-150">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-xs font-extrabold text-slate-400">Q{idx + 1}</span>
                            <span className={`badge ${
                              q.difficulty === 'easy' ? 'badge-green' :
                              q.difficulty === 'hard' ? 'badge-red' :
                              'badge-amber'
                            }`}>
                              {q.difficulty}
                            </span>
                            {q.is_common && (
                              <span className="badge badge-purple">
                                Common
                              </span>
                            )}
                            {q.category && (
                              <span className="badge badge-gray">
                                {q.category}
                              </span>
                            )}
                            <span className="badge badge-gray font-bold">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                          </div>
                          
                          <p className="text-slate-800 font-bold text-sm mb-3 leading-relaxed">{q.question_text}</p>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} className={`text-xs px-3.5 py-2 rounded-lg border ${
                                q.correct_answer === oIdx 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold' 
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}>
                                <span className="font-extrabold text-slate-400 mr-1.5">{String.fromCharCode(65 + oIdx)}.</span> {opt}
                                {q.correct_answer === oIdx && <span className="ml-1 text-emerald-600 font-bold float-right">✓ Correct</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="btn btn-danger-outline btn-sm py-1.5 px-3 shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: AI assistant chat panel */}
          <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-20">
            <div className="card h-[480px] flex flex-col justify-between overflow-hidden shadow-md">
              
              {/* AI Header */}
              <div className="bg-slate-900 px-4 py-3.5 text-white flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <div>
                    <h3 className="font-bold text-xs">AI Exam Assistant</h3>
                    <p className="text-[9px] text-slate-400 mt-0.5">Llama 3.3 via Groq</p>
                  </div>
                </div>
                {aiLoading ? (
                  <button
                    onClick={handleAiStop}
                    className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition"
                    title="Stop generating"
                  >
                    <span className="w-2 h-2 rounded-sm bg-white" />
                    Stop
                  </button>
                ) : (
                  <div className="spinner-circle w-4 h-4 border-2 border-white border-t-transparent hidden" />
                )}
              </div>

              {/* Chat Message Logs */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {aiLogs.map((log, idx) => (
                  <div key={idx} className={`flex ${log.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                      log.sender === 'user'
                        ? 'bg-slate-800 text-white font-bold rounded-tr-none'
                        : 'bg-white border border-slate-200 text-slate-700 font-medium rounded-tl-none'
                    }`}>
                      {log.text}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 text-slate-400 rounded-xl rounded-tl-none px-3 py-2 text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                      <span>Drafting questions...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestion Prompts */}
              <div className="p-3 border-t border-slate-100 bg-white">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Quick Actions:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    ['📝 +5 English', 'bro English k 5 MCQ questions add kr de'],
                    ['✏️ Change Last', 'last question change kr k chemistry topic pe kr de'],
                    ['🟢 Make Easy', 'sare questions ki difficulty easy kr de'],
                  ].map(([label, fullPrompt]) => (
                    <button
                      key={label}
                      disabled={aiLoading}
                      onClick={(e) => handleAiSubmit(e, fullPrompt)}
                      className="btn btn-secondary btn-sm text-[10px] py-1 px-2"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Input + Speech Button */}
              <form onSubmit={handleAiSubmit} className="p-2 border-t border-slate-100 bg-slate-50 flex gap-2 items-center">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    isListening
                      ? 'bg-red-50 border-red-300 text-red-500 animate-pulse'
                      : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                  }`}
                  title="Speak instruction"
                >
                  🎤
                </button>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  disabled={aiLoading}
                  placeholder={isListening ? "Listening..." : "Instruct AI..."}
                  className="form-control text-xs py-1.5"
                />
                <button
                  type="submit"
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="btn btn-primary py-1.5 px-3 shrink-0 text-xs font-bold"
                >
                  Send
                </button>
              </form>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

