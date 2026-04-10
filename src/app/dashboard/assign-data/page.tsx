'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ClipboardList, Search, Filter } from 'lucide-react';
import {
  collection, query, where, orderBy, onSnapshot, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/usePrograms';
import { updateDocument, createDocument } from '@/lib/firestore';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { formatCallSessionLabel, sortCallSessions } from '@/lib/utils';
import { CALLING_ASSIST_OPTIONS, HANDLER_OPTIONS } from '@/types';
import type {
  Lead, CallSession, Batch, Level, Program, LeadCallReport,
  CallingAssistStatus, HandlerStatus,
} from '@/types';

// ─── Helper: upsert call report ────────────────────────────────────────────────
async function upsertReport(
  existing: LeadCallReport | undefined,
  batchId: string,
  leadId: string,
  callSessionId: string,
  patch: Partial<LeadCallReport>,
  userId: string,
) {
  if (existing) {
    await updateDocument<LeadCallReport>('callReports', existing.id, patch);
  } else {
    await createDocument<Omit<LeadCallReport, 'id'>>('callReports', {
      batchId,
      leadId,
      callSessionId,
      registrationReport: '',
      callingAssistReport: null,
      callingAssistId: null,
      handlerReport: null,
      handlerId: userId,
      customFieldValues: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...patch,
    } as Omit<LeadCallReport, 'id'>);
  }
}

// ─── Calling Assist View ───────────────────────────────────────────────────────
function CallingAssistView({ leads, calls, reports, uid }: {
  leads: Lead[];
  calls: CallSession[];
  reports: LeadCallReport[];
  uid: string;
}) {
  const reportMap = new Map(reports.map((r) => [`${r.leadId}_${r.callSessionId}`, r]));
  const [search, setSearch] = useState('');
  const [selectedCall, setSelectedCall] = useState<string>(calls[0]?.id ?? '');

  const filtered = leads.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search),
  );

  const activeCall = calls.find((c) => c.id === selectedCall);

  async function handleChange(lead: Lead, value: CallingAssistStatus | '') {
    if (!activeCall) return;
    const key = `${lead.id}_${activeCall.id}`;
    const existing = reportMap.get(key);
    await upsertReport(existing, lead.batchId, lead.id, activeCall.id, {
      callingAssistReport: value || null,
      callingAssistId: uid,
    }, uid);
    toast.success('Saved');
  }

  return (
    <div className="space-y-4">
      {/* Call selector */}
      {calls.length > 0 && (
        <Select
          label="Select Call Session"
          value={selectedCall}
          onChange={(e) => setSelectedCall(e.target.value)}
          options={calls.map((c) => ({ value: c.id, label: formatCallSessionLabel(c) }))}
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input-glass pl-9"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="table-glass w-full">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => {
              const key = `${lead.id}_${selectedCall}`;
              const rep = reportMap.get(key);
              return (
                <tr key={lead.id}>
                  <td className="text-slate-500">{lead.serialNumber}</td>
                  <td className="font-medium text-slate-200">{lead.name}</td>
                  <td className="text-slate-400">{lead.phone}</td>
                  <td className="min-w-[180px]">
                    <select
                      className="input-glass py-1.5 text-sm cursor-pointer"
                      value={rep?.callingAssistReport ?? ''}
                      onChange={(e) => handleChange(lead, e.target.value as CallingAssistStatus | '')}
                      disabled={!selectedCall}
                    >
                      <option value="">— Select —</option>
                      {CALLING_ASSIST_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Backend Assist View ───────────────────────────────────────────────────────
function BackendAssistView({ leads, calls, reports, uid }: {
  leads: Lead[];
  calls: CallSession[];
  reports: LeadCallReport[];
  uid: string;
}) {
  const reportMap = new Map(reports.map((r) => [`${r.leadId}_${r.callSessionId}`, r]));
  const [search, setSearch] = useState('');
  const [selectedCall, setSelectedCall] = useState<string>(calls[0]?.id ?? '');

  const filtered = leads.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search),
  );

  const activeCall = calls.find((c) => c.id === selectedCall);

  async function handleChange(lead: Lead, value: HandlerStatus | '') {
    if (!activeCall) return;
    const key = `${lead.id}_${activeCall.id}`;
    const existing = reportMap.get(key);
    await upsertReport(existing, lead.batchId, lead.id, activeCall.id, {
      handlerReport: value || null,
      handlerId: uid,
    }, uid);
    toast.success('Saved');
  }

  return (
    <div className="space-y-4">
      {calls.length > 0 && (
        <Select
          label="Select Call Session"
          value={selectedCall}
          onChange={(e) => setSelectedCall(e.target.value)}
          options={calls.map((c) => ({ value: c.id, label: formatCallSessionLabel(c) }))}
        />
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input-glass pl-9"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="table-glass w-full">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Calling Status</th>
              <th>Handler Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => {
              const key = `${lead.id}_${selectedCall}`;
              const rep = reportMap.get(key);
              return (
                <tr key={lead.id}>
                  <td className="text-slate-500">{lead.serialNumber}</td>
                  <td className="font-medium text-slate-200">{lead.name}</td>
                  <td className="text-slate-400 text-xs">{lead.email}</td>
                  <td className="text-slate-400">{lead.phone}</td>
                  <td>
                    {rep?.callingAssistReport ? (
                      <Badge variant="info">{rep.callingAssistReport}</Badge>
                    ) : '—'}
                  </td>
                  <td className="min-w-[180px]">
                    <select
                      className="input-glass py-1.5 text-sm cursor-pointer"
                      value={rep?.handlerReport ?? ''}
                      onChange={(e) => handleChange(lead, e.target.value as HandlerStatus | '')}
                      disabled={!selectedCall}
                    >
                      <option value="">— Select —</option>
                      {HANDLER_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AssignDataPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [reports, setReports] = useState<LeadCallReport[]>([]);
  const [batchOptions, setBatchOptions] = useState<{ value: string; label: string; batch: Batch }[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [loading, setLoading] = useState(false);

  // Build batch dropdown from all batches
  useEffect(() => {
    if (!user) return;
    const fetchBatches = async () => {
      const snap = await getDocs(collection(db, 'batches'));
      const allBatches = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Batch));
      // For backend_assist, filter to batches where they are a handler —
      // we simplify by showing all batches (leads will auto-filter by handler)
      const opts = await Promise.all(
        allBatches.map(async (b) => {
          const [pSnap, lSnap] = await Promise.all([
            getDocs(query(collection(db, 'programs'), where('__name__', '==', b.programId))),
            getDocs(query(collection(db, 'levels'), where('__name__', '==', b.levelId))),
          ]);
          const pName = pSnap.docs[0]?.data()?.name ?? '';
          const lName = lSnap.docs[0]?.data()?.name ?? '';
          return { value: b.id, label: `${pName} › ${lName} › Batch ${b.batchNumber}`, batch: b };
        }),
      );
      setBatchOptions(opts);
    };
    fetchBatches();
  }, [user]);

  // Load data when batch selected
  useEffect(() => {
    if (!selectedBatchId) return;
    setLoading(true);

    const leadsQ =
      user?.role === 'backend_assist'
        ? query(collection(db, 'leads'), where('batchId', '==', selectedBatchId), where('handlerId', '==', user.uid), orderBy('serialNumber', 'asc'))
        : query(collection(db, 'leads'), where('batchId', '==', selectedBatchId), orderBy('serialNumber', 'asc'));

    const callsQ = query(
      collection(db, 'callSessions'),
      where('batchId', '==', selectedBatchId),
      orderBy('date', 'asc'),
      orderBy('order', 'asc'),
    );

    const reportsQ = query(collection(db, 'callReports'), where('batchId', '==', selectedBatchId));

    const unsubs = [
      onSnapshot(leadsQ, (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead))); setLoading(false); }),
      onSnapshot(callsQ, (snap) => {
        setCalls(sortCallSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession))));
      }),
      onSnapshot(reportsQ, (snap) => { setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadCallReport))); }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [selectedBatchId, user]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold gradient-text">Assign Data</h1>
        <p className="text-slate-500 text-sm mt-1">
          {user?.role === 'calling_assist'
            ? 'Update calling status for your assigned leads'
            : user?.role === 'backend_assist'
            ? 'Manage your assigned leads and update handler status'
            : 'View and manage all lead reports'}
        </p>
      </div>

      <div className="glass-card p-5 mb-5">
        <Select
          label="Select Batch"
          value={selectedBatchId}
          onChange={(e) => setSelectedBatchId(e.target.value)}
          placeholder="— Choose a batch —"
          options={batchOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>

      {!selectedBatchId ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Select a batch to view and update data</p>
        </div>
      ) : loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="glass-card p-8 text-center text-slate-500">
          No leads found for this batch
          {user?.role === 'backend_assist' && ' assigned to you'}.
        </div>
      ) : (
        <div className="glass-card p-5">
          {user?.role === 'calling_assist' ? (
            <CallingAssistView leads={leads} calls={calls} reports={reports} uid={user.uid} />
          ) : (
            <BackendAssistView leads={leads} calls={calls} reports={reports} uid={user?.uid ?? ''} />
          )}
        </div>
      )}
    </div>
  );
}
