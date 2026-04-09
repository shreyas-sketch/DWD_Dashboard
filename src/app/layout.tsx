import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Mudita',
  description: 'Mudita — Backend Assist',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-mesh min-h-screen">
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgba(15, 15, 46, 0.95)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f1f5f9',
                backdropFilter: 'blur(16px)',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
