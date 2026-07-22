'use client';
import React, { useState } from 'react';

export default function TeacherMessageSender({ studentId, studentName, onSend }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const presets = [
    'Focus on screen',
    'Stop cheating',
    'Time running out',
    'Are you okay?',
  ];

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await onSend?.(studentId, message);
      setMessage('');
    } catch (e) {
      console.error('Send error:', e);
    }
    setSending(false);
  };

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-3">Message to {studentName || 'Student'}</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map(p => (
          <button key={p} onClick={() => setMessage(p)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              message === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
            }`}>
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Type message..." className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={handleSend} disabled={!message.trim() || sending}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 transition disabled:opacity-50">
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

