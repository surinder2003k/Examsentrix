'use client';
import { useUser, useAuth, useClerk } from '@clerk/nextjs';

export function useClerkUser() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken, signOut } = useAuth();
  const clerk = useClerk();

  return {
    isLoaded,
    isSignedIn,
    user: user ? {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName || user.username || 'User',
      imageUrl: user.imageUrl,
    } : null,
    getToken,
    signOut,
    clerk,
  };
}

