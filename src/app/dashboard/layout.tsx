'use client';

// Opt out of static prerendering for all dashboard routes.
// These pages require Firebase/auth which is client-only.
export const dynamic = 'force-dynamic';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { FilterProvider } from '@/contexts/FilterContext';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { PageLoader } from '@/components/ui/LoadingSpinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace('/login');
    }
  }, [loading, firebaseUser, router]);

  if (loading) return <PageLoader />;
  if (!firebaseUser) return null;

  return <FilterProvider><DashboardShell>{children}</DashboardShell></FilterProvider>;
}
