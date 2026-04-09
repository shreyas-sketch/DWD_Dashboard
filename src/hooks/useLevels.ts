'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Level } from '@/types';

export function useLevels(programId: string | null) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!programId) { setLevels([]); setLoading(false); return; }
    const q = query(
      collection(db, 'levels'),
      where('programId', '==', programId),
      orderBy('order', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setLevels(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Level)));
      setLoading(false);
    }, (err) => {
      console.error('[useLevels]', err.message);
      setLoading(false);
    });
    return unsub;
  }, [programId]);

  return { levels, loading };
}
