'use client';

import React, { useEffect, useRef } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/nextjs';
import useExamStore from '../src/store/examStore';
import { api } from '../src/utils/api';
import AlertModal from '../src/components/AlertModal';

function SyncUser() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const synced = useRef(false);
  const setUser = useExamStore(state => state.setUser);

  useEffect(() => {
    if (getToken) {
      window.__get_clerk_token = getToken;
    }
  }, [getToken]);

  useEffect(() => {
    if (isLoaded && isSignedIn && user && !synced.current) {
      synced.current = true;
      const syncUser = async () => {
        const email = user.primaryEmailAddress?.emailAddress || '';
        try {
          useExamStore.getState().setError(null);
          const token = await getToken();
          api.setToken(token);
          const data = await api.syncUser({ clerk_id: user.id, email, name: user.fullName || user.username });
          if (data?.user) {
            setUser(data.user);
          }
        } catch (error) {
          console.error('Sync error:', error);
          synced.current = false;
          useExamStore.getState().setError(error.message || 'Failed to synchronize user session.');
        }
      };
      syncUser();
    }
  }, [isLoaded, isSignedIn, user, setUser, getToken]);

  return null;
}

function VerificationGuard({ children }) {
  const { isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const storeUser = useExamStore(state => state.user);
  const error = useExamStore(state => state.error);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="spinner"><div className="spinner-circle"></div></div>
      </div>
    );
  }

  if (isSignedIn && !storeUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="text-center p-6 max-w-sm w-full">
          {error ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-base font-bold text-slate-800 mb-1.5">Connection Failed</h2>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">{error}</p>
              <button
                onClick={() => {
                  useExamStore.getState().setError(null);
                  window.location.reload();
                }}
                className="btn btn-primary btn-sm btn-w-full"
              >
                🔄 Retry Connection
              </button>
            </div>
          ) : (
            <>
              <div className="spinner"><div className="spinner-circle"></div></div>
              <p className="text-slate-500 text-sm mt-2">Checking system permissions…</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (isSignedIn && storeUser && !storeUser.is_active) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md text-center max-w-sm w-full">
          <div className="text-4xl mb-3">⏳</div>
          <h2 className="text-base font-bold text-slate-800 mb-1.5">Access Pending Verification</h2>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">Your account is awaiting admin approval. Please check back later.</p>
          <button onClick={() => signOut()} className="btn btn-secondary btn-sm w-full">Sign Out</button>
        </div>
      </div>
    );
  }

  return children;
}

export default function ClientLayout({ children }) {
  return (
    <>
      <AlertModal />
      <SyncUser />
      <VerificationGuard>
        {children}
      </VerificationGuard>
    </>
  );
}

