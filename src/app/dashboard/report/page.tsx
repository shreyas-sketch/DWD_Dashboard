'use client';

import React, { useState, useMemo } from 'react';
import { BarChart2, TrendingUp, Trophy, Phone, Users, ClipboardList } from 'lucide-react';
import { usePrograms } from '@/hooks/usePrograms';
import { useLevels } from '@/hooks/useLevels';
import { useBatches } from '@/hooks/useBatches';
import { useLeads } from '@/hooks/useLeads';
import { useCallSessions } from '@/hooks/useCallSessions';
import { useCallReports } from '@/hooks/useCallReports';
import { Select } from '@/components/ui/Select';
import { formatDate, getCallSessionTypeLabel, sortCallSessions } from '@/lib/utils';
import { CALLING_ASSIST_OPTIONS, HANDLER_OPTIONS } from '@/types';
import type { CallSession, Lead, LeadCallReport } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportType = 'registration' | 'calling' | 'handler' | 'funnel';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pct(n: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  return arr.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

// ─── Registration Report ──────────────────────────────────────────────────────
function RegistrationReport({
  mainSessions,
  leads,
  reportMap,
}: {
  mainSessions: CallSession[];
  leads: Lead[];
  reportMap: Map<string, LeadCallReport>;
}) {
  const REG_STATUSES = ['Registered', 'Not Registered', 'Not Found'] as const;

  const rows = mainSessions.map((session) => {
    const counts: Record<string, number> = { Registered: 0, 'Not Registered': 0, 'Not Found': 0, 'No Data': 0 };
    leads.forEach((lead) => {
      const rep = reportMap.get(`${lead.id}_${session.id}`);
      const val = rep?.registrationReport;
      if (val === 'Registered') counts['Registered']++;
      else if (val === 'Not Registered') counts['Not Registered']++;
      else if (val === 'Not Found') counts['Not Found']++;
      else counts['No Data']++;
    });
    return { session, counts, total: leads.length };
  });

  if (rows.length === 0) return <EmptyState label="No main call sessions found" />;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="table-glass text-xs w-full">
        <thead>
          <tr>
            <th>Session</th>
            <th>Date</th>
            <th className="text-emerald-400">Registered</th>
            <th className="text-red-400">Not Registered</th>
            <th className="text-amber-400">Not Found</th>
            <th className="text-slate-500">No Data</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ session, counts, total }) => (
            <tr key={session.id}>
              <td className="font-medium text-slate-200">{session.name} <span className="text-slate-500 font-normal">({getCallSessionTypeLabel(session.sessionType)})</span></td>
              <td className="text-slate-400">{formatDate(session.date)}</td>
              <td>
                <span className="font-semibold text-emerald-400">{counts['Registered']}</span>
                <span className="text-slate-500 ml-1">{pct(counts['Registered'], total)}</span>
              </td>
              <td>
                <span className="font-semibold text-red-400">{counts['Not Registered']}</span>
                <span className="text-slate-500 ml-1">{pct(counts['Not Registered'], total)}</span>
              </td>
              <td>
                <span className="font-semibold text-amber-400">{counts['Not Found']}</span>
                <span className="text-slate-500 ml-1">{pct(counts['Not Found'], total)}</span>
              </td>
              <td>
                <span className="text-slate-500">{counts['No Data']}</span>
                <span className="text-slate-600 ml-1">{pct(counts['No Data'], total)}</span>
              </td>
              <td className="font-semibold text-slate-300">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Calling Assist Summary ───────────────────────────────────────────────────
function CallingAssistReport({
  mainSessions,
  leads,
  reportMap,
}: {
  mainSessions: CallSession[];
  leads: Lead[];
  reportMap: Map<string, LeadCallReport>;
}) {
  const RED_FLAGS = new Set(['Out Of Service-NR', 'Incoming Inactive-NR', "Won't Attend-NR"]);

  const rows = mainSessions.map((session) => {
    const values = leads
      .map((lead) => reportMap.get(`${lead.id}_${session.id}`)?.callingAssistReport ?? '')
      .filter(Boolean);
    const counts = countBy(values, (v) => v);
    const noData = leads.length - values.length;
    return { session, counts, noData, total: leads.length };
  });

  if (rows.length === 0) return <EmptyState label="No main call sessions found" />;

  return (
    <div className="space-y-5">
      {rows.map(({ session, counts, noData, total }) => (
        <div key={session.id} className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone size={14} className="text-indigo-400" />
            <span className="font-semibold text-slate-200 text-sm">{session.name}</span>
            <span className="text-slate-500 text-xs">{formatDate(session.date)}</span>
            <span className="ml-auto text-xs text-slate-500">{total} leads</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {CALLING_ASSIST_OPTIONS.map((status) => (
              <div
                key={status}
                className={`rounded-xl p-3 border ${RED_FLAGS.has(status) ? 'bg-red-500/8 border-red-500/20' : 'bg-white/3 border-white/6'}`}
              >
                <p className={`text-lg font-bold ${RED_FLAGS.has(status) ? 'text-red-400' : 'text-slate-200'}`}>
                  {counts[status] ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{status}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{pct(counts[status] ?? 0, total)}</p>
              </div>
            ))}
            <div className="rounded-xl p-3 border bg-white/2 border-white/4">
              <p className="text-lg font-bold text-slate-500">{noData}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">No Data</p>
              <p className="text-[10px] text-slate-700 mt-0.5">{pct(noData, total)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Handler Summary ──────────────────────────────────────────────────────────
function HandlerReport({
  allSessions,
  leads,
  reportMap,
}: {
  allSessions: CallSession[];
  leads: Lead[];
  reportMap: Map<string, LeadCallReport>;
}) {
  const rows = allSessions.map((session) => {
    const values = leads
      .map((lead) => reportMap.get(`${lead.id}_${session.id}`)?.handlerReport ?? '')
      .filter(Boolean);
    const counts = countBy(values, (v) => v);
    const noData = leads.length - values.length;
    return { session, counts, noData, total: leads.length };
  });

  if (rows.length === 0) return <EmptyState label="No sessions found" />;

  return (
    <div className="space-y-5">
      {rows.map(({ session, counts, noData, total }) => (
        <div key={session.id} className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={14} className="text-purple-400" />
            <span className="font-semibold text-slate-200 text-sm">{session.name}</span>
            <span className="text-slate-500 text-xs">{formatDate(session.date)} · {getCallSessionTypeLabel(session.sessionType)}</span>
            <span className="ml-auto text-xs text-slate-500">{total} leads</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {HANDLER_OPTIONS.map((status) => (
              <div
                key={status}
                className={`rounded-xl p-3 border ${
                  status === "Don't Call Them" ? 'bg-red-500/8 border-red-500/20' :
                  status === 'Call Them' ? 'bg-sky-500/8 border-sky-500/20' :
                  'bg-white/3 border-white/6'
                }`}
              >
                <p className={`text-lg font-bold ${
                  status === "Don't Call Them" ? 'text-red-400' :
                  status === 'Call Them' ? 'text-sky-400' :
                  'text-slate-200'
                }`}>
                  {counts[status] ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{status}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{pct(counts[status] ?? 0, total)}</p>
              </div>
            ))}
            <div className="rounded-xl p-3 border bg-white/2 border-white/4">
              <p className="text-lg font-bold text-slate-500">{noData}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">No Data</p>
              <p className="text-[10px] text-slate-700 mt-0.5">{pct(noData, total)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Won / Deposit Funnel ─────────────────────────────────────────────────────
function FunnelReport({ leads, levelId, levelName }: { leads: Lead[]; levelId: string; levelName: string }) {
  const depositLeads = leads.filter((l) => l.tags?.some((t) => t.type === 'deposit' && t.levelId === levelId));
  const wonLeads = leads.filter((l) => l.tags?.some((t) => t.type === 'won' && t.levelId === levelId));
  const total = leads.length;

  const steps = [
    { label: 'Total Leads', count: total, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20', icon: <Users size={18} className="text-indigo-400" /> },
    { label: `Deposit Paid (${levelName})`, count: depositLeads.length, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: <TrendingUp size={18} className="text-amber-400" /> },
    { label: `Won (${levelName})`, count: wonLeads.length, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: <Trophy size={18} className="text-emerald-400" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map((step, i) => (
          <div key={i} className={`rounded-2xl border p-6 ${step.bg}`}>
            <div className="flex items-start justify-between mb-3">
              {step.icon}
              {i > 0 && (
                <span className="text-xs text-slate-500">{pct(step.count, total)} of total</span>
              )}
            </div>
            <p className={`text-4xl font-bold ${step.color}`}>{step.count}</p>
            <p className="text-sm text-slate-400 mt-1">{step.label}</p>
          </div>
        ))}
      </div>

      {/* Funnel bar */}
      {total > 0 && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Conversion Funnel</p>
          {steps.map((step, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{step.label}</span>
                <span className={step.color}>{step.count} <span className="text-slate-600">({pct(step.count, total)})</span></span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    i === 0 ? 'bg-indigo-500/60' : i === 1 ? 'bg-amber-500/60' : 'bg-emerald-500/60'
                  }`}
                  style={{ width: total ? `${(step.count / total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Won & Deposit leads list */}
      {wonLeads.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
            <Trophy size={14} /> Won Leads ({wonLeads.length})
          </p>
          <div className="space-y-1.5">
            {wonLeads.map((lead) => (
              <div key={lead.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg bg-emerald-500/5">
                <span className="font-medium text-slate-200 flex-1">{lead.name}</span>
                <span className="text-slate-500">{lead.email}</span>
                <span className="text-slate-600">{lead.phone}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12">
      <BarChart2 size={32} className="text-slate-600 mx-auto mb-2" />
      <p className="text-slate-500 text-sm">{label}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const { programs } = usePrograms();
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [reportType, setReportType] = useState<ReportType>('registration');

  const { levels } = useLevels(selectedProgramId || null);
  const { batches } = useBatches(selectedLevelId || null);
  const { leads } = useLeads(selectedBatchId || null);
  const { calls } = useCallSessions(selectedBatchId || null);
  const { reportMap } = useCallReports(selectedBatchId || null);

  // Reset downstream when upstream changes
  function handleProgramChange(id: string) {
    setSelectedProgramId(id);
    setSelectedLevelId('');
    setSelectedBatchId('');
  }
  function handleLevelChange(id: string) {
    setSelectedLevelId(id);
    setSelectedBatchId('');
  }

  const selectedLevel = levels.find((l) => l.id === selectedLevelId);
  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  const sortedCalls = useMemo(() => sortCallSessions(calls), [calls]);
  const mainSessions = useMemo(
    () => sortedCalls.filter((c) => c.sessionType === 'main' || !c.sessionType),
    [sortedCalls],
  );

  const reportTabs: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: 'registration', label: 'Registration', icon: <ClipboardList size={14} /> },
    { key: 'calling', label: 'Calling Assist', icon: <Phone size={14} /> },
    { key: 'handler', label: 'Handler', icon: <Users size={14} /> },
    { key: 'funnel', label: 'Won / Deposit', icon: <Trophy size={14} /> },
  ];

  const isReady = !!selectedBatchId;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold gradient-text">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Select a batch to view detailed reports</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Program"
            value={selectedProgramId}
            onChange={(e) => handleProgramChange(e.target.value)}
            placeholder="Select Program"
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Select
            label="Level"
            value={selectedLevelId}
            onChange={(e) => handleLevelChange(e.target.value)}
            placeholder={selectedProgramId ? 'Select Level' : '— Select program first —'}
            options={levels.map((l) => ({ value: l.id, label: l.name }))}
            disabled={!selectedProgramId}
          />
          <Select
            label="Batch"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            placeholder={selectedLevelId ? 'Select Batch' : '— Select level first —'}
            options={batches.map((b) => ({ value: b.id, label: b.batchName || `Batch ${b.batchNumber}` }))}
            disabled={!selectedLevelId}
          />
        </div>
      </div>

      {!isReady ? (
        <div className="glass-card p-12 text-center">
          <BarChart2 size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Select a program, level, and batch to view reports</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Users size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No leads in this batch yet</p>
        </div>
      ) : (
        <div>
          {/* Batch info banner */}
          <div className="glass-card p-4 mb-5 flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-slate-500">Batch</p>
              <p className="text-sm font-semibold text-slate-200">{selectedBatch?.batchName || `Batch ${selectedBatch?.batchNumber}`}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Leads</p>
              <p className="text-sm font-semibold text-indigo-400">{leads.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Call Sessions</p>
              <p className="text-sm font-semibold text-slate-300">{calls.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Main Sessions</p>
              <p className="text-sm font-semibold text-slate-300">{mainSessions.length}</p>
            </div>
          </div>

          {/* Report type tabs */}
          <div className="flex gap-1 mb-5 border-b border-white/8 overflow-x-auto">
            {reportTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setReportType(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  reportType === t.key
                    ? 'text-indigo-400 border-b-2 border-indigo-400 -mb-px'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="glass-card p-5">
            {reportType === 'registration' && (
              <RegistrationReport mainSessions={mainSessions} leads={leads} reportMap={reportMap} />
            )}
            {reportType === 'calling' && (
              <CallingAssistReport mainSessions={mainSessions} leads={leads} reportMap={reportMap} />
            )}
            {reportType === 'handler' && (
              <HandlerReport allSessions={sortedCalls} leads={leads} reportMap={reportMap} />
            )}
            {reportType === 'funnel' && (
              <FunnelReport
                leads={leads}
                levelId={selectedLevelId}
                levelName={selectedLevel?.name ?? ''}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
