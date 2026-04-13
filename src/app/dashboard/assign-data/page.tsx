'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ClipboardList, Search, Filter, X } from 'lucide-react';
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useFilter } from '@/contexts/FilterContext';
import { usePrograms } from '@/hooks/usePrograms';
import { useLevels } from '@/hooks/useLevels';
import { useBatches } from '@/hooks/useBatches';
import { updateDocument, createDocument } from '@/lib/firestore';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { formatCallSessionLabel, sortCallSessions } from '@/lib/utils';
import { CALLING_ASSIST_OPTIONS, HANDLER_OPTIONS } from '@/types';
import type {
  Lead, CallSession, Batch, LeadCallReport,
  CallingAssistStatus, HandlerStatus,
} from '@/types';

const CALLING_ASSIST_RED_FLAGS = new Set([
  'Out Of Service-NR',
  'Incoming Inactive-NR',
  "Won't Attend-NR",
]);

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
    const autoHandler: HandlerStatus | null = value
      ? CALLING_ASSIST_RED_FLAGS.has(value)
        ? "Don't Call Them"
        : 'Call Them'
      : null;
    await upsertReport(existing, lead.batchId, lead.id, activeCall.id, {
      callingAssistReport: value || null,
      callingAssistId: uid,
      handlerReport: autoHandler,
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
              const caVal = rep?.callingAssistReport ?? '';
              const isRedFlag = CALLING_ASSIST_RED_FLAGS.has(caVal);
              return (
                <tr key={lead.id}>
                  <td className="text-slate-500">{lead.serialNumber}</td>
                  <td className="font-medium text-slate-200">{lead.name}</td>
                  <td className="text-slate-400">{lead.phone}</td>
                  <td className="min-w-[180px]">
                    <select
                      className={`input-glass py-1.5 text-sm cursor-pointer font-medium ${
                        isRedFlag ? 'text-red-400' : caVal ? 'text-emerald-400' : ''
                      }`}
                      value={caVal}
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
              const caVal = rep?.callingAssistReport ?? '';
              const handlerVal = rep?.handlerReport ?? '';
              const isRedFlag = CALLING_ASSIST_RED_FLAGS.has(caVal);
              return (
                <tr key={lead.id}>
                  <td className="text-slate-500">{lead.serialNumber}</td>
                  <td className="font-medium text-slate-200">{lead.name}</td>
                  <td className="text-slate-400 text-xs">{lead.email}</td>
                  <td className="text-slate-400">{lead.phone}</td>
                  <td>
                    {caVal ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        isRedFlag
                          ? 'text-red-400 bg-red-500/10 border-red-500/20'
                          : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                      }`}>{caVal}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="min-w-[180px]">
                    <select
                      className={`input-glass py-1.5 text-sm cursor-pointer font-medium ${
                        handlerVal === "Don't Call Them" ? 'text-red-400' :
                        handlerVal === 'Call Them' ? 'text-sky-400' :
                        handlerVal ? 'text-emerald-400' : ''
                      }`}
                      value={handlerVal}
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

  // ── Cascading filters (shared across pages via FilterContext) ──
  const {
    programId: selectedProgramId,
    levelId: selectedLevelId,
    batchId: selectedBatchId,
    handleProgramChange,
    handleLevelChange,
    setBatchId: setSelectedBatchId,
    clearFilters,
  } = useFilter();
  const { programs, loading: programsLoading } = usePrograms();
  const { levels, loading: levelsLoading } = useLevels(selectedProgramId || null);
  const { batches, loading: batchesLoading } = useBatches(selectedLevelId || null);
  const [appliedBatchId, setAppliedBatchId] = useState('');
  const [appliedBatch, setAppliedBatch] = useState<Batch | null>(null);

  // ── Live data for the applied batch ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [reports, setReports] = useState<LeadCallReport[]>([]);
  const [loading, setLoading] = useState(false);

  const filtersLoading = programsLoading || levelsLoading || batchesLoading;

  function handleApply() {
    const batch = batches.find((b) => b.id === selectedBatchId) ?? null;
    setAppliedBatchId(selectedBatchId);
    setAppliedBatch(batch);
  }

  function handleClear() {
    clearFilters();
    setAppliedBatchId('');
    setAppliedBatch(null);
    setLeads([]);
    setCalls([]);
    setReports([]);
  }

  // Load live data when a batch is applied
  useEffect(() => {
    if (!appliedBatchId) return;
    setLoading(true);

    const leadsQ =
      user?.role === 'backend_assist'
        ? query(collection(db, 'leads'), where('batchId', '==', appliedBatchId), where('handlerId', '==', user.uid), orderBy('serialNumber', 'asc'))
        : query(collection(db, 'leads'), where('batchId', '==', appliedBatchId), orderBy('serialNumber', 'asc'));

    const callsQ = query(
      collection(db, 'callSessions'),
      where('batchId', '==', appliedBatchId),
      orderBy('date', 'asc'),
      orderBy('order', 'asc'),
    );

    const reportsQ = query(collection(db, 'callReports'), where('batchId', '==', appliedBatchId));

    const unsubs = [
      onSnapshot(leadsQ, (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
        setLoading(false);
      }),
      onSnapshot(callsQ, (snap) => {
        setCalls(sortCallSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession))));
      }),
      onSnapshot(reportsQ, (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadCallReport)));
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [appliedBatchId, user]);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);
  const selectedLevel = levels.find((l) => l.id === selectedLevelId);
  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

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

      {/* ── Filters card ── */}
      <div className="glass-card p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Select
            label="Program"
            value={selectedProgramId}
            onChange={(e) => handleProgramChange(e.target.value)}
            placeholder="— Select program —"
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            disabled={programsLoading}
          />
          <Select
            label="Level"
            value={selectedLevelId}
            onChange={(e) => handleLevelChange(e.target.value)}
            placeholder="— Select level —"
            options={levels.map((l) => ({ value: l.id, label: l.name }))}
            disabled={!selectedProgramId || levelsLoading}
          />
          <Select
            label="Batch"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            placeholder="— Select batch —"
            options={batches.map((b) => ({
              value: b.id,
              label: b.batchName ? `${b.batchName} (#${b.batchNumber})` : `Batch ${b.batchNumber}`,
            }))}
            disabled={!selectedLevelId || batchesLoading}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Applied label */}
          {appliedBatch && (
            <p className="text-xs text-slate-500 truncate">
              Showing:{' '}
              <span className="text-slate-300 font-medium">
                {selectedProgram?.name} › {selectedLevel?.name} › {appliedBatch.batchName || `Batch ${appliedBatch.batchNumber}`}
              </span>
            </p>
          )}
          <div className="flex gap-2 ml-auto">
            {appliedBatchId && (
              <Button variant="secondary" size="sm" onClick={handleClear}>
                <X size={14} /> Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!selectedBatchId || filtersLoading}
            >
              <Filter size={14} /> Load Batch
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {!appliedBatchId ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Select a program, level and batch above, then click <strong>Load Batch</strong></p>
        </div>
      ) : loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="glass-card p-8 text-center text-slate-500">
          No leads found for this batch{user?.role === 'backend_assist' && ' assigned to you'}.
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
