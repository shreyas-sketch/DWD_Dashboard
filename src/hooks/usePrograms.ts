'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Program } from '@/types';

export function usePrograms() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'programs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPrograms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Program)));
      setLoading(false);
    });
    return unsub;
  }, []);

  return { programs, loading };
}
