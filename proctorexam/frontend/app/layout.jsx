import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import ClientLayout from './client-layout';

export const metadata = {
  title: 'ExamSentrix - AI Proctored Exam System',
  description: 'Secure online exam proctoring platform with real-time AI monitoring, gaze tracking, tab-switch detection, and intelligent assessment tools.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_YW1hemVkLXdoYWxlLTIwLmNsZXJrLmFjY291bnRzLmRldiQ';

  return (
    <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/">
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body>
          <ClientLayout>
            {children}
          </ClientLayout>
        </body>
      </html>
    </ClerkProvider>
  );
}

