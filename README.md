# ExamSentrix

AI-Powered Proctored Exam Platform — secure online examinations with real-time AI webcam proctoring, live teacher monitoring, and automated scoring.

## Live Demo

- **Frontend:** [examsentrix.vercel.app](https://examsentrix.vercel.app)
- **Backend:** [examsentrix-backend.onrender.com](https://examsentrix-backend.onrender.com)

## Features

- **AI Question Generation** — Generate MCQs via Groq/OpenRouter/Gemini AI with fallback chain
- **AI Webcam Proctoring** — Real-time gaze tracking, face detection, multiple face alerts
- **Live Teacher Monitoring** — Camera feeds, instant alerts, send warnings, force submit
- **Student Dashboard** — Browse exams, track results, attempt tests
- **Auto-Scoring** — Instant MCQ evaluation with percentage breakdown
- **Tab Switch Detection** — Auto-submit after 5 tab switches
- **Role-Based Access** — Student, Teacher, Super Admin with approval flow
- **Real-Time Toasts** — Live notifications when students join/leave exams

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Zustand |
| Auth | Clerk (JWT + RBAC) |
| Backend | Express.js, Socket.IO |
| Database | Supabase (PostgreSQL) |
| AI | Groq, OpenRouter, Google Gemini |
| Hosting | Vercel (Frontend), Render (Backend) |

## Project Structure

```
proctorexam/
  frontend/           # Next.js 14 App Router
    app/              # Pages & routes
    src/
      components/     # UI components
      hooks/          # Socket, proctoring, WebRTC hooks
      page-views/     # Student, Teacher, SuperAdmin views
      store/          # Zustand state management
      utils/          # API client, helpers
  backend/            # Express + Socket.IO server
    routes/           # API routes (auth, exams, questions, proctoring)
    services/         # AI assist, AI proctor
    socket/           # Socket.IO event handlers
    middleware/       # Clerk JWT verification, role checks
  supabase/
    migrations/       # Database schema SQL
```

## Local Development

```bash
# Frontend
cd proctorexam/frontend
cp .env.example .env    # Add your env vars
npm install
npm run dev             # Runs on http://localhost:3000

# Backend
cd proctorexam/backend
cp .env.example .env    # Add your env vars
npm install
node server.js          # Runs on http://localhost:3001
```

## Environment Variables

### Frontend (`proctorexam/frontend/.env`)

| Variable | Description |
|----------|------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_API_URL` | Backend API URL (empty for local dev) |
| `NEXT_PUBLIC_SOCKET_URL` | Backend Socket URL (empty for local dev) |
| `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` | Auto-approved super admin email |

### Backend (`proctorexam/backend/.env`)

| Variable | Description |
|----------|------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `FRONTEND_URL` | Frontend origin for CORS |
| `OPENROUTER_API_KEY` | OpenRouter API key (optional) |
| `GEMINI_API_KEY` | Google Gemini API key (optional) |

## Database Setup

Run migrations in order via Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_fix_teacher_exam_visibility.sql`
3. `supabase/migrations/fix_rls.sql`

## License

Private — All rights reserved.
