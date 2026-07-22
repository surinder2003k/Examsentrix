'use client';
// Fisher-Yates shuffle algorithm
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Format time from seconds to MM:SS
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper to parse date strings safely
function parseDate(dateString) {
  if (!dateString) return new Date();
  // If already ends with Z or contains timezone offset, treat as-is
  if (typeof dateString === 'string' && (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-'))) {
    // Check if it already has timezone info (contains +hh:mm or -hh:mm)
    const hasTZ = /[+-]\d{2}:\d{2}$/.test(dateString) || dateString.endsWith('Z');
    if (hasTZ || dateString.includes('T')) {
      return new Date(dateString);
    }
  }
  // Otherwise treat as local datetime string (e.g., from datetime-local input)
  return new Date(dateString);
}

// Format date to readable string
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return parseDate(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Get time remaining until a deadline
export function getTimeRemaining(deadline) {
  const total = parseDate(deadline) - new Date();
  if (total <= 0) return { total: 0, hours: 0, minutes: 0, seconds: 0, expired: true };

  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return { total, days, hours, minutes, seconds, expired: false };
}

// Get status color based on exam status
export function getStatusColor(status) {
  const colors = {
    draft: 'bg-gray-100 text-gray-800',
    published: 'bg-green-100 text-green-800',
    closed: 'bg-red-100 text-red-800',
    assigned: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    expired: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

// Get severity color
export function getSeverityColor(severity) {
  const colors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };
  return colors[severity] || 'bg-gray-100 text-gray-800';
}

// Truncate text
export function truncateText(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Generate a unique device fingerprint
export function generateDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ];
  const fingerprint = components.join('|||');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Parse CSV questions (handles commas in quoted text)
export function parseCSVQuestions(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const questions = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 6) continue;

    questions.push({
      question_text: values[0],
      options: [values[1], values[2], values[3], values[4]],
      correct_answer: parseInt(values[5]),
      difficulty: values[6] || 'medium',
      is_common: values[7]?.toLowerCase() === 'true',
      marks: parseInt(values[8]) || 1,
      category: values[9] || null,
    });
  }

  return questions;
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

// Get initials from name
export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
