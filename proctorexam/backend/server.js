import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import authRoutes from './routes/auth.js';
import examRoutes from './routes/exams.js';
import questionRoutes from './routes/questions.js';
import proctoringRoutes from './routes/proctoring.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const httpServer = createServer(app);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'https://examsentrix.vercel.app',
  /https:\/\/.*\.trycloudflare\.com$/,
  /https:\/\/.*\.cloudflareaccess\.com$/
];

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Allow non-browser clients
      const allowed = allowedOrigins.some(o => 
        typeof o === 'string' ? o === origin : o.test(origin)
      );
      if (allowed || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o => 
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.url.startsWith('/socket.io')) {
    console.log(`  [Socket.IO] Query:`, req.query);
  }
  next();
});

// Make supabase and io available to routes
app.set('supabase', supabase);
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/exams', questionRoutes);
app.use('/api/monitoring', proctoringRoutes);

// Health check + DB keep-alive
app.get('/api/health', async (req, res) => {
  try {
    await supabase.from('keep_alive').insert({ timestamp: new Date().toISOString() });
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (e) {
    res.json({ status: 'ok', db: 'error', timestamp: new Date().toISOString() });
  }
});

// Setup Socket.io handlers
setupSocketHandlers(io, supabase);

const PORT = process.env.PORT || 3001;
const keepAliveInterval = setInterval(async () => {
  try {
    await supabase.from('keep_alive').insert({ timestamp: new Date().toISOString() });
    // Cleanup entries older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('keep_alive').delete().lt('timestamp', sevenDaysAgo);
  } catch (e) {
    // Silent fail
  }
}, 300000); // Every 5 minutes

const shutdown = () => {
  clearInterval(keepAliveInterval);
  httpServer.close(() => {
    console.log('Server shut down gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});