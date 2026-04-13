'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CallTemplate } from '@/types';

export function useCallTemplates(levelId: string | null) {
  const [templates, setTemplates] = useState<CallTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!levelId) { setTemplates([]); setLoading(false); return; }
    const q = query(
      collection(db, 'callTemplates'),
      where('levelId', '==', levelId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallTemplate));
      data.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setTemplates(data);
      setLoading(false);
    }, (err) => {
      console.error('[useCallTemplates]', err.message);
      setLoading(false);
    });
    return unsub;
  }, [levelId]);

  return { templates, loading };
}
