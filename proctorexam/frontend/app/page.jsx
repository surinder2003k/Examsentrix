'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, SignIn, SignUp } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';

export default function HomePage() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  useEffect(() => {
    if (isSignedIn) router.push('/dashboard');
  }, [isSignedIn, router]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative h-screen flex flex-col">
        <nav className="site-nav">
          <div className="inner">
            <div className="nav-logo">
              <div className="nav-logo-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="nav-logo-text">ExamSentrix</span>
            </div>
            <div className="nav-right">
              <button onClick={() => setShowSignIn(true)} className="btn btn-ghost btn-sm text-white border-none hover:bg-white/10">
                Log In
              </button>
              <button onClick={() => setShowSignUp(true)} className="btn btn-primary btn-sm">
                Sign Up
              </button>
            </div>
          </div>
        </nav>

        <section className="landing-hero flex-1 flex flex-col justify-center items-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto px-4 text-center"
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-tight leading-tight">
              Secure Online Exam <br />
              <span className="text-emerald-400">Proctoring Platform</span>
            </h1>
            <p className="text-base sm:text-lg text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
              Protect the integrity of online assessments with real-time AI gaze tracking, tab-switch monitoring, automated screen updates, and direct messaging features.
            </p>
            <div className="hero-btns">
              <button onClick={() => setShowSignUp(true)} className="btn btn-primary btn-lg px-8">
                Get Started Free &rarr;
              </button>
              <button onClick={() => setShowSignIn(true)} className="btn btn-secondary btn-lg px-8 bg-transparent text-white border-white/20 hover:bg-white/5">
                Access Dashboard
              </button>
            </div>
          </motion.div>
        </section>
      </div>

      <section className="bg-white py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-slate-900 mb-12">Built with Advanced Integrity Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <motion.div whileHover={{ y: -3 }} className="feature-card">
              <div className="feature-icon">🤖</div>
              <h3>AI Gaze Tracker</h3>
              <p className="text-sm text-slate-500 mt-2">Monitors student eye direction and facial presence to deter secondary screen viewing during live testing.</p>
            </motion.div>
            <motion.div whileHover={{ y: -3 }} className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Tab Lock Mechanism</h3>
              <p className="text-sm text-slate-500 mt-2">Deters page navigation. Swapping windows triggers warning counters and handles automatic papers submit.</p>
            </motion.div>
            <motion.div whileHover={{ y: -3 }} className="feature-card">
              <div className="feature-icon">👁️</div>
              <h3>Live Proctor Console</h3>
              <p className="text-sm text-slate-500 mt-2">Enables teachers to view active students, receive warnings, and communicate instructions via live warnings.</p>
            </motion.div>
            <motion.div whileHover={{ y: -3 }} className="feature-card">
              <div className="feature-icon">✨</div>
              <h3>AI Exam Assistant</h3>
              <p className="text-sm text-slate-500 mt-2">Build papers faster. Generate subject matter questions from descriptions using advanced AI generation.</p>
            </motion.div>
            <motion.div whileHover={{ y: -3 }} className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>Grades &amp; Logs</h3>
              <p className="text-sm text-slate-500 mt-2">Detailed breakdown of answers, calculated marks, tab switch timelines, and overall proctoring compliance.</p>
            </motion.div>
            <motion.div whileHover={{ y: -3 }} className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Granular Roles</h3>
              <p className="text-sm text-slate-500 mt-2">Strict access controls separating Students, Teachers, and Super Admins for secure workflow isolation.</p>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-900 border-t border-slate-800 py-8 text-center text-slate-400 text-sm">
        <p>&copy; 2026 ExamSentrix. Clean, secure, and professional online assessments.</p>
      </footer>

      <AnimatePresence>
        {showSignIn && (
          <div className="modal-overlay" onClick={() => setShowSignIn(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal-box relative"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowSignIn(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">&times;</button>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Account Access</h2>
              <SignIn
                routing="virtual"
                signUpUrl="/sign-up"
                forceRedirectUrl="/dashboard"
                fallbackRedirectUrl="/dashboard"
                afterSignInUrl="/dashboard"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSignUp && (
          <div className="modal-overlay" onClick={() => setShowSignUp(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal-box relative"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowSignUp(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">&times;</button>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Create Account</h2>
              <SignUp
                routing="virtual"
                signInUrl="/sign-in"
                forceRedirectUrl="/dashboard"
                fallbackRedirectUrl="/dashboard"
                afterSignUpUrl="/dashboard"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
