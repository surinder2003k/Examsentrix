export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
};

export const EXAM_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
};

export const STUDENT_EXAM_STATUS = {
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
};

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export const PROCTORING_EVENTS = {
  FOCUS_LOST: 'focus_lost',
  TAB_SWITCH: 'tab_switch',
  FULLSCREEN_EXIT: 'fullscreen_exit',
  TEACHER_MESSAGE: 'teacher_message',
  MULTIPLE_FACES: 'multiple_faces',
  NO_FACE: 'no_face',
  LOOKING_LEFT: 'looking_left',
  LOOKING_RIGHT: 'looking_right',
  LOOKING_UP: 'looking_up',
  LOOKING_DOWN: 'looking_down',
  FORCE_SUBMIT: 'force_submit',
};

export const MAX_TAB_SWITCHES = 5;
export const MAX_FOCUS_ALERTS = 10;
export const CAMERA_FRAME_INTERVAL = 2000; // 2 seconds
export const AI_CONFIDENCE_THRESHOLD = 0.7;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
export const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || '';
