import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const metadata: Metadata = {
  title: 'Mudita',
  description: 'Mudita — Backend Assist',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-mesh min-h-screen">
        <ThemeProvider>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'toast-glass',
              style: {
                background: 'var(--toast-bg)',
                border: '1px solid var(--toast-border)',
                color: 'var(--toast-color)',
                backdropFilter: 'blur(16px)',
              },
            }}
          />
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
