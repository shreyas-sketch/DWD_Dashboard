'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { LeadCallReport } from '@/types';

export function useCallReports(batchId: string | null) {
  const [reports, setReports] = useState<LeadCallReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) { setReports([]); setLoading(false); return; }
    const q = query(
      collection(db, 'callReports'),
      where('batchId', '==', batchId),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadCallReport)));
      setLoading(false);
    });
    return unsub;
  }, [batchId]);

  // Returns a map: `${leadId}_${callSessionId}` -> LeadCallReport
  const reportMap = new Map(reports.map((r) => [`${r.leadId}_${r.callSessionId}`, r]));

  return { reports, reportMap, loading };
}
