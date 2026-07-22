'use client';
import React, { useState } from 'react';

export default function BulkUpload({ onImport }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleImport = () => {
    setError('');
    try {
      const lines = text.trim().split('\n').filter(l => l.trim());
      const questions = lines.map((line, i) => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 6) throw new Error(`Line ${i + 1}: Invalid format. Expected: question,option1,option2,option3,option4,correct_index,difficulty,is_common,marks`);
        return {
          id: Date.now().toString() + i,
          question_text: parts[0],
          options: [parts[1], parts[2], parts[3], parts[4]],
          correct_answer: parseInt(parts[5]) || 0,
          difficulty: parts[6] || 'medium',
          is_common: parts[7] === 'true',
          marks: parseInt(parts[8]) || 1,
          category: parts[9] || '',
        };
      });
      if (questions.length === 0) { setError('No valid questions found'); return; }
      onImport(questions);
      setText('');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-3">Bulk CSV Import</h3>
      <p className="text-sm text-gray-500 mb-3">Format per line: question,option1,option2,option3,option4,correct_index(0-3),difficulty,is_common(true/false),marks,category</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
        placeholder={`What is 2+2?,1,2,3,4,3,easy,false,1,Math\nWhat is the capital of France?,London,Paris,Berlin,Madrid,1,medium,true,2,Geography`}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <button onClick={handleImport} disabled={!text.trim()}
        className="mt-3 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 transition disabled:opacity-50">
        Import Questions ({text.trim().split('\n').filter(l => l.trim()).length})
      </button>
    </div>
  );
}

