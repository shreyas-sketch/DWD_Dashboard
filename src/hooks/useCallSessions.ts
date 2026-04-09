'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CallSession } from '@/types';

export function useCallSessions(batchId: string | null) {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) { setCalls([]); setLoading(false); return; }
    const q = query(
      collection(db, 'callSessions'),
      where('batchId', '==', batchId),
      orderBy('date', 'asc'),
      orderBy('order', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setCalls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession)));
      setLoading(false);
    });
    return unsub;
  }, [batchId]);

  return { calls, loading };
}
