# AGENTS.md

## Architecture

Two-package monorepo under `proctorexam/`:

- **`proctorexam/frontend/`** — Next.js 14 (App Router) + Tailwind + Clerk auth
- **`proctorexam/backend/`** — Express + Socket.io + Clerk JWT verification
- **Database**: Supabase (PostgreSQL) — `proctorexam/supabase/migrations/`
- **State**: Zustand (`src/store/examStore.js`)

**Note**: The README still references Vite. The frontend was migrated to Next.js 14 — trust the `package.json`, not the README.

## Running

```bash
# Frontend (Next.js dev server on :3000)
cd proctorexam/frontend && npm run dev

# Backend (Express with --watch on :3001)
cd proctorexam/backend && npm run dev
```

Both must run simultaneously. Frontend proxies API calls to backend via Next.js rewrites (`next.config.js` rewrites `/api/*` and `/socket.io/*` to `localhost:3001`).

## Environment Variables

**Backend** (`proctorexam/backend/.env`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Supabase connection
- `CLERK_SECRET_KEY` — Clerk JWT verification
- `OPENROUTER_API_KEY` — AI proctoring (Gemini Flash)
- `CLIENT_URL` — Frontend origin for CORS (default `http://localhost:3000`)

**Frontend** (`proctorexam/frontend/.env`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk client-side auth
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `NEXT_PUBLIC_API_URL` — Leave empty (`''`) to use Next.js rewrites proxy
- `NEXT_PUBLIC_SOCKET_URL` — Leave empty to use `window.location.origin`

## Key Gotchas

- **New users are inactive by default** — `is_active: false` until super_admin approves. The `VerificationGuard` in `client-layout.jsx` blocks the UI until sync succeeds.
- **Super admin auto-detected** — The email in `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` (or hardcoded in `auth.js`) gets `super_admin` role and auto-activation on sync.
- **Clerk middleware** — `middleware.js` at frontend root runs Clerk on all routes except static assets. Don't add your own middleware without understanding this.
- **Socket.io uses polling** — Configured for polling-only transport to work through Cloudflare tunnels and Next.js rewrites. WebSocket upgrade is disabled.
- **Rate limiting on sockets** — `camera_frame`: 30/min, `tab_switch`: 10/min, `answer_question`: 60/min, `request_submit`: 5/min.
- **`API_BASE_URL` is empty string** — All API calls go to same origin (localhost:3000) and get proxied to backend. Don't set it to `http://localhost:3001` or it bypasses the proxy.

## Auth Flow

1. User signs in via Clerk (login page at `/sign-in`)
2. `SyncUser` component calls `POST /api/auth/sync` with Clerk user data
3. Backend upserts user in Supabase `users` table
4. Backend updates Clerk `publicMetadata.role` for RBAC
5. `VerificationGuard` in `client-layout.jsx` gates UI — shows error/spinner until `storeUser` is set

## Routes & Pages

- `/sign-in`, `/sign-up` — Clerk auth pages
- `/dashboard` — Role-based dashboard (renders `StudentDashboard`, `TeacherDashboard`, or `GrantAccess` based on role)
- `/student/take-exam/[id]` — Exam taking interface
- `/student/results/[id]` — Results view

## Backend Structure

- `server.js` — Express app, creates Socket.io server, mounts routes
- `routes/auth.js` — User sync, role management
- `routes/exams.js` — Exam CRUD
- `routes/questions.js` — Question management + bulk upload
- `routes/proctoring.js` — Student exams, scoring, monitoring
- `socket/socketHandler.js` — All Socket.io event handlers
- `middleware/auth.js` — Clerk JWT verification + Supabase user lookup
- `middleware/roleCheck.js` — Role-based access control

## Database

Run migrations in order via Supabase SQL Editor:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_fix_teacher_exam_visibility.sql`

Key tables: `users`, `exams`, `questions`, `student_exams`, `responses`, `proctoring_logs`

## Dead Code / Known Issues

- `useAIProctor` hook exists but is never imported
- WebRTC handlers in socket exist but are unused
- `monitoring_sessions` table is dead
- `keep_alive` table has no cleanup mechanism
- README references Vite config (`vite.config.js`) but project uses Next.js — README is outdated
