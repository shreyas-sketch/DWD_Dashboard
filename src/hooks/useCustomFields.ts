'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CustomField } from '@/types';

export function useCustomFields(batchId: string | null) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) { setFields([]); setLoading(false); return; }
    const q = query(
      collection(db, 'customFields'),
      where('batchId', '==', batchId),
      orderBy('order', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setFields(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomField)));
      setLoading(false);
    });
    return unsub;
  }, [batchId]);

  return { fields, loading };
}
