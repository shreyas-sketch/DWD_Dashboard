'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Batch } from '@/types';

/**
 * Returns batches that have the given calling_assist UID in assignedCallingAssistIds.
 * Used exclusively by calling_assist users in the Assign Data page.
 */
export function useAssignedBatches(uid: string | null) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setBatches([]); setLoading(false); return; }
    const q = query(
      collection(db, 'batches'),
      where('assignedCallingAssistIds', 'array-contains', uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Batch))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setBatches(data);
      setLoading(false);
    }, (err) => {
      console.error('[useAssignedBatches]', err.message);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  return { batches, loading };
}
