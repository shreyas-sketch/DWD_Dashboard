'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Lead } from '@/types';

export function useLeads(batchId: string | null) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) { setLeads([]); setLoading(false); return; }
    const q = query(
      collection(db, 'leads'),
      where('batchId', '==', batchId),
      orderBy('serialNumber', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return unsub;
  }, [batchId]);

  return { leads, loading };
}

export function useAllLeads(handlerId: string | null) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handlerId) { setLeads([]); setLoading(false); return; }
    const q = query(
      collection(db, 'leads'),
      where('handlerId', '==', handlerId),
      orderBy('serialNumber', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return unsub;
  }, [handlerId]);

  return { leads, loading };
}
