# ProctorExam - Enterprise AI-Powered Proctored Examination Platform

A complete, production-ready proctored examination platform with real-time AI monitoring, anti-cheat measures, and role-based access control.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + Socket.io
- **Database**: Supabase (PostgreSQL) with full RLS
- **Auth**: Clerk with role-based access
- **Real-time**: Socket.io + WebRTC (simple-peer for P2P camera)
- **AI**: OpenRouter API (google/gemini-flash-1.5 for proctoring)
- **State**: Zustand for client state

## Project Structure

```
proctorexam/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/ (ClerkProvider, RoleGuard, ProtectedRoute)
│   │   │   ├── exam/ (StudentExam, QuestionCard, ExamTimer, etc.)
│   │   │   ├── proctoring/ (HiddenCamera, LiveMonitorGrid, etc.)
│   │   │   └── admin/ (ExamCreator, QuestionBank, BulkUpload, etc.)
│   │   ├── hooks/ (useFullscreen, useTabDetection, useSocket, etc.)
│   │   ├── pages/ (Student, Teacher, SuperAdmin pages)
│   │   ├── utils/ (constants, helpers, api)
│   │   ├── store/ (Zustand exam store)
│   │   └── App.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── .env
├── backend/
│   ├── server.js
│   ├── socket/socketHandler.js
│   ├── routes/ (auth, exams, questions, proctoring)
│   ├── middleware/ (auth, roleCheck)
│   ├── services/aiProctor.js
│   └── package.json
└── supabase/
    └── migrations/001_initial_schema.sql
```

## Features

### Authentication & Roles
- **Super Admin**: Manage users, grant/revoke teacher access
- **Teacher**: Create exams, add questions, monitor live, view results
- **Student**: Take exams, view results

### Exam Creation
- Create exams with custom settings (duration, deadline, passing percentage)
- Add questions manually or via CSV bulk upload
- Mark questions as "common" (all students get these)
- Set difficulty levels and categories
- Shuffle questions automatically

### Student Exam Interface
- Fullscreen lock with exit detection
- Tab switch detection (max 5 switches before auto-submit)
- Keyboard shortcut blocking (Ctrl+C, Ctrl+V, F12, etc.)
- AI-powered camera proctoring (detects looking away, multiple faces, no face)
- Question palette with navigation
- Mark for review
- Auto-save answers
- Timer with warnings

### Teacher Live Monitoring
- Real-time student grid view
- Focus alerts and tab switch tracking
- Send messages to students during exam
- Force submit option
- Proctoring logs with severity levels

### Results System
- Detailed score breakdown
- Question-wise analysis
- Tab switch and focus alert counts
- Pass/fail status
- Results only visible after publish time

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Clerk account
- OpenRouter API key

### 1. Clone and Install

```bash
# Install frontend dependencies
cd proctorexam/frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### 2. Environment Variables

**Frontend** (`proctorexam/frontend/.env`):
```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

**Backend** (`proctorexam/backend/.env`):
```env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
CLERK_SECRET_KEY=your_clerk_secret_key
OPENROUTER_API_KEY=your_openrouter_key
CLIENT_URL=http://localhost:5173
```

### 3. Database Setup

Run the migration SQL in your Supabase SQL Editor:

```bash
# Open supabase/migrations/001_initial_schema.sql and run it in Supabase
```

### 4. Start Development Servers

```bash
# Terminal 1 - Backend
cd proctorexam/backend
npm run dev

# Terminal 2 - Frontend
cd proctorexam/frontend
npm run dev
```

### 5. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Database Schema

### Tables
- **users**: User profiles synced with Clerk
- **exams**: Exam configurations
- **questions**: Question bank
- **student_exams**: Personalized exam papers
- **responses**: Student answers
- **proctoring_logs**: AI monitoring events
- **monitoring_sessions**: Teacher monitoring sessions
- **keep_alive**: Prevent Supabase pausing

### Key Features
- Row Level Security (RLS) on all tables
- Automatic question paper generation with shuffling
- Real-time updates via Supabase Realtime

## API Endpoints

### Auth
- `POST /api/auth/sync` - Sync Clerk user to Supabase
- `GET /api/auth/me` - Get current user
- `POST /api/auth/grant-teacher` - Grant teacher role (super_admin)
- `POST /api/auth/revoke-teacher` - Revoke teacher role (super_admin)
- `GET /api/auth/users` - List all users

### Exams
- `GET /api/exams` - List exams (role-based)
- `POST /api/exams` - Create exam (teacher)
- `GET /api/exams/:id` - Get exam details
- `PUT /api/exams/:id` - Update exam
- `DELETE /api/exams/:id` - Delete exam
- `POST /api/exams/:id/publish` - Publish exam
- `POST /api/exams/:id/close` - Close exam

### Questions
- `GET /api/exams/:examId/questions` - Get questions
- `POST /api/exams/:examId/questions` - Add question
- `PUT /api/exams/:examId/questions/:questionId` - Update question
- `DELETE /api/exams/:examId/questions/:questionId` - Delete question
- `POST /api/exams/:examId/questions/bulk` - Bulk upload questions

### Student Exams
- `POST /api/monitoring/student-exams/assign` - Assign exam to student
- `POST /api/monitoring/student-exams/:id/start` - Start exam
- `POST /api/monitoring/student-exams/:id/submit` - Submit exam
- `POST /api/monitoring/student-exams/:id/answer` - Save answer
- `GET /api/monitoring/student-exams/:id/results` - Get results

### Monitoring
- `GET /api/monitoring/:examId/students` - Get active students
- `POST /api/monitoring/message` - Send message to student
- `POST /api/monitoring/force-submit` - Force submit exam
- `GET /api/monitoring/:examId/logs` - Get proctoring logs

## Socket.io Events

### Student Events
- `join_exam` - Join exam room
- `camera_frame` - Send frame for AI analysis
- `answer_question` - Save answer
- `tab_switch` - Report tab switch
- `request_submit` - Request to submit

### Teacher Events
- `teacher_monitor` - Join monitoring room
- `send_message` - Send message to student
- `force_submit` - Force submit student exam
- `request_video` - Request WebRTC connection

### Server Events
- `focus_alert` - Send to student (AI detected looking away)
- `teacher_message` - Send to student (from teacher)
- `exam_ended` - Auto-submit signal
- `proctoring_update` - Send to teacher dashboard
- `student_joined` - New student started exam
- `student_left` - Student disconnected

## Anti-Cheat Measures

1. **Fullscreen Lock**: Automatically enters fullscreen, prevents exit
2. **Tab Switch Detection**: Monitors tab visibility changes (max 5)
3. **Keyboard Blocking**: Disables Ctrl+C/V/X, F12, Alt+Tab, etc.
4. **AI Proctoring**: Analyzes webcam frames every 2 seconds
5. **Context Menu Block**: Prevents right-click
6. **Copy/Paste Block**: Prevents clipboard access
7. **Auto-Submit**: Triggers on time expiry or violations

## Deployment

### Frontend (Vercel)
1. Connect repository to Vercel
2. Set environment variables
3. Deploy

### Backend (Railway/Render)
1. Connect repository
2. Set environment variables
3. Deploy (ensure WebSocket support)

### Supabase
- Free tier with keep-alive script
- Enable Realtime for student_exams and proctoring_logs

### Clerk
- Free tier (10,000 MAU)
- Configure redirect URLs

## Security Notes

- All API routes protected with Clerk authentication
- Role-based access control on all endpoints
- Row Level Security in Supabase
- No video storage (only live analysis)
- Device fingerprinting for duplicate detection
- IP tracking for same-network cheating detection

## License

MIT