'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import useExamStore from '../../src/store/examStore';
import GrantAccess from '../../src/page-views/SuperAdmin/GrantAccess';
import TeacherDashboard from '../../src/page-views/Teacher/Dashboard';
import StudentDashboard from '../../src/page-views/Student/Dashboard';
import { SUPER_ADMIN_EMAIL } from '../../src/utils/constants';

function DashboardCard({ icon, title, desc, onClick }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      onClick={onClick}
      className="action-card"
    >
      <div className="action-card-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <div className="action-card-arrow">Configure Actions ➜</div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const storeUser = useExamStore(state => state.user);
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const role = SUPER_ADMIN_EMAIL && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
    ? 'super_admin'
    : (storeUser?.role || user?.publicMetadata?.role || 'student');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
  };

  const getDashboardTitle = () => {
    switch (role) {
      case 'super_admin': return 'Admin Control Panel';
      case 'teacher': return 'Teacher Dashboard';
      default: return 'Student Portal';
    }
  };

  const getDashboardDesc = () => {
    switch (role) {
      case 'super_admin': return 'Manage users, grant permissions, and oversee platform operations';
      case 'teacher': return 'Create exams, monitor students, and analyze results';
      default: return 'Take exams, monitor results, and track your academic progress';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
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
            <div className="nav-user-info">
              <span className="nav-user-name">{user?.fullName || user?.username || 'User'}</span>
              <span className="nav-user-email">{email}</span>
            </div>
            <span className={`nav-badge ${role}`}>
              {role === 'super_admin' ? 'ADMIN' : role}
            </span>
            <button onClick={handleLogout} className="btn-nav-logout">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="nav-logout-text">Logout</span>
            </button>
            <button className="hamburger-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <span style={{ transform: mobileMenuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
              <span style={{ opacity: mobileMenuOpen ? 0 : 1 }} />
              <span style={{ transform: mobileMenuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
            </button>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="mobile-nav-panel">
          <div className="mobile-nav-user">
            <div className="mobile-avatar">{email.charAt(0).toUpperCase()}</div>
            <div>
              <p className="text-white text-sm font-semibold">{user?.fullName || user?.username || 'User'}</p>
              <p className="text-slate-400 text-xs">{email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-danger btn-sm btn-w-full">
            Sign Out
          </button>
        </div>
      )}

      <div className="page flex-1 flex flex-col gap-6">
        <div className="welcome-banner">
          <div className="welcome-online-dot">System Verified &amp; Secured</div>
          <h2>{getDashboardTitle()}</h2>
          <p>{getDashboardDesc()}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card"
        >
          <div className="card-body">
            {role === 'super_admin' && <GrantAccess />}
            {role === 'teacher' && <TeacherDashboard />}
            {role === 'student' && <StudentDashboard />}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

