'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SignInCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
