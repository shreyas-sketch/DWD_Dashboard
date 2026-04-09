'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Batch } from '@/types';

export function useBatches(levelId: string | null) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!levelId) { setBatches([]); setLoading(false); return; }
    const q = query(
      collection(db, 'batches'),
      where('levelId', '==', levelId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Batch)));
      setLoading(false);
    });
    return unsub;
  }, [levelId]);

  return { batches, loading };
}
