'use client';
import React, { useState } from 'react';

export default function QuestionBank({ questions, setQuestions }) {
  const [newQ, setNewQ] = useState({ question_text: '', options: ['', '', '', ''], correct_answer: 0, difficulty: 'medium', marks: 1, is_common: false, category: '' });

  const addQuestion = () => {
    if (!newQ.question_text || newQ.options.some(o => !o)) return;
    setQuestions(prev => [...prev, { ...newQ, id: Date.now().toString() }]);
    setNewQ({ question_text: '', options: ['', '', '', ''], correct_answer: 0, difficulty: 'medium', marks: 1, is_common: false, category: '' });
  };

  const removeQuestion = (id) => setQuestions(prev => prev.filter(q => q.id !== id));

  const counts = { total: questions.length, common: questions.filter(q => q.is_common).length, easy: questions.filter(q => q.difficulty === 'easy').length, medium: questions.filter(q => q.difficulty === 'medium').length, hard: questions.filter(q => q.difficulty === 'hard').length };

  return (
    <div>
      <div className="flex gap-4 mb-6 text-sm">
        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full">Total: {counts.total}</span>
        <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full">Common: {counts.common}</span>
        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full">Easy: {counts.easy}</span>
        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full">Medium: {counts.medium}</span>
        <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full">Hard: {counts.hard}</span>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Add Question</h3>
        <div className="space-y-4">
          <input value={newQ.question_text} onChange={e => setNewQ(prev => ({ ...prev, question_text: e.target.value }))} placeholder="Question text" className="w-full px-4 py-2 border rounded-xl text-sm" />
          <div className="grid grid-cols-2 gap-3">
            {newQ.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" checked={newQ.correct_answer === i} onChange={() => setNewQ(prev => ({ ...prev, correct_answer: i }))} />
                <input value={opt} onChange={e => { const opts = [...newQ.options]; opts[i] = e.target.value; setNewQ(prev => ({ ...prev, options: opts })); }} placeholder={`Option ${String.fromCharCode(65 + i)}`} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            <select value={newQ.difficulty} onChange={e => setNewQ(prev => ({ ...prev, difficulty: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
            <input type="number" value={newQ.marks} onChange={e => setNewQ(prev => ({ ...prev, marks: parseInt(e.target.value) || 1 }))} className="w-20 px-3 py-2 border rounded-lg text-sm" min="1" />
            <input value={newQ.category} onChange={e => setNewQ(prev => ({ ...prev, category: e.target.value }))} placeholder="Category" className="px-3 py-2 border rounded-lg text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newQ.is_common} onChange={e => setNewQ(prev => ({ ...prev, is_common: e.target.checked }))} />
              Common
            </label>
          </div>
          <button onClick={addQuestion} disabled={!newQ.question_text} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">Add Question</button>
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="bg-white rounded-xl p-4 border border-gray-200 flex justify-between items-start">
            <div>
              <p className="font-medium text-gray-900">{i + 1}. {q.question_text}</p>
              <div className="flex gap-2 mt-2 text-xs">
                <span className={`px-2 py-0.5 rounded ${q.difficulty === 'easy' ? 'bg-green-100 text-green-700' : q.difficulty === 'hard' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{q.difficulty}</span>
                {q.is_common && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Common</span>}
                {q.category && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{q.category}</span>}
                <span className="text-gray-400">{q.marks} marks</span>
              </div>
            </div>
            <button onClick={() => removeQuestion(q.id)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

