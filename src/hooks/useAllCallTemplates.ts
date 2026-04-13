'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CallTemplate } from '@/types';

export function useAllCallTemplates() {
  const [templates, setTemplates] = useState<CallTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'callTemplates'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallTemplate)));
      setLoading(false);
    }, (err) => {
      console.error('[useAllCallTemplates]', err.message);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { templates, loading };
}
