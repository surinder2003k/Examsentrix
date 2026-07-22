'use client';
import React from 'react';

export default function ExamSettings({ register, errors, watch }) {
  return (
    <div className="bg-white rounded-2xl p-8 border border-gray-200">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Exam Settings</h3>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input {...register('title')} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
          <input type="number" {...register('duration_minutes', { valueAsNumber: true })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.duration_minutes && <p className="text-red-500 text-sm mt-1">{errors.duration_minutes.message}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea {...register('description')} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deadline (last date to start)</label>
          <input type="datetime-local" {...register('deadline')} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.deadline && <p className="text-red-500 text-sm mt-1">{errors.deadline.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Result Publish Time</label>
          <input type="datetime-local" {...register('result_publish_time')} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.result_publish_time && <p className="text-red-500 text-sm mt-1">{errors.result_publish_time.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Questions Per Student</label>
          <input type="number" {...register('questions_per_student', { valueAsNumber: true })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Passing Percentage</label>
          <input type="number" {...register('passing_percentage', { valueAsNumber: true })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-3">
            <input type="checkbox" {...register('shuffle_questions')} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">Shuffle questions for each student</span>
          </label>
        </div>
      </div>
    </div>
  );
}

