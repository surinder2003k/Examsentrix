'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ROLES } from '../../utils/constants';
import useExamStore from '../../store/examStore';

export function RoleGuard({ children, allowedRoles, fallback }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const storeUser = useExamStore(state => state.user);
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push('/');
      return;
    }
    const role = storeUser?.role || user?.publicMetadata?.role || 'student';
    if (!allowedRoles.includes(role)) {
      router.push('/dashboard');
    }
  }, [isLoaded, isSignedIn, user, storeUser, allowedRoles, router]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  const role = storeUser?.role || user?.publicMetadata?.role || 'student';

  if (!allowedRoles.includes(role)) {
    if (fallback) return fallback;
    return null;
  }

  return children;
}

export function useUserRole() {
  const { user } = useUser();
  const storeUser = useExamStore(state => state.user);
  return storeUser?.role || user?.publicMetadata?.role || 'student';
}

