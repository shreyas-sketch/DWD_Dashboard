'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, UserRole } from '@/types';

export function useUsers(role?: UserRole) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // When filtering by role, only use where() — no orderBy — to avoid needing a
    // composite Firestore index. Sort client-side instead.
    const constraints = role
      ? [where('role', '==', role)]
      : [orderBy('displayName', 'asc')];
    const q = query(collection(db, 'users'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ ...d.data() } as AppUser));
      if (role) data.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setUsers(data);
      setLoading(false);
    }, (err) => {
      console.error('[useUsers]', err.message);
      setLoading(false);
    });
    return unsub;
  }, [role]);

  return { users, loading };
}
