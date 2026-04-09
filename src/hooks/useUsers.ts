'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, UserRole } from '@/types';

export function useUsers(role?: UserRole) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const constraints = role
      ? [where('role', '==', role), orderBy('displayName', 'asc')]
      : [orderBy('displayName', 'asc')];
    const q = query(collection(db, 'users'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ ...d.data() } as AppUser)));
      setLoading(false);
    });
    return unsub;
  }, [role]);

  return { users, loading };
}
