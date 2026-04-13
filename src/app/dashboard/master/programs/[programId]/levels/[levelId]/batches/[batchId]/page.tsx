'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Plus, Upload, Phone, Users, Settings2, Trash2, Pencil,
  ChevronLeft, RefreshCw, Download, ChevronRight, AlertTriangle,
  TrendingUp, Trophy, ClipboardList, UserCheck, UserX, ChevronsUp,
} from 'lucide-react';
import { doc, getDoc, collection, writeBatch, arrayUnion, arrayRemove, updateDoc, onSnapshot, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Papa from 'papaparse';
import { useLeads } from '@/hooks/useLeads';
import { useCallSessions } from '@/hooks/useCallSessions';
import { useCallTemplates } from '@/hooks/useCallTemplates';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useCallReports } from '@/hooks/useCallReports';
import { useUsers } from '@/hooks/useUsers';
import { useLevels } from '@/hooks/useLevels';
import { useBatches } from '@/hooks/useBatches';
import { useAuth } from '@/contexts/AuthContext';
import { createDocument, updateDocument, deleteDocument, batchWrite } from '@/lib/firestore';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  distributeLeads,
  formatDate,
  getCallSessionGroupKey,
  getCallSessionTypeLabel,
  sortCallSessions,
  getCallingAssistColor,
  isCallingAssistRedFlag,
  getHandlerStatusColor,
} from '@/lib/utils';
import { CALLING_ASSIST_OPTIONS, HANDLER_OPTIONS } from '@/types';
import type {
  Program, Level, Batch, CallSession, CallSessionType, CustomField, Lead, LeadCallReport, CustomFieldType, LeadTag,
  CallTemplate,
} from '@/types';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'leads' | 'calls' | 'fields' | 'report' | 'assign';

type CallGroup = {
  key: string;
  name: string;
  date: string;
  order: number;
  sessions: CallSession[];
};

const CALL_NAME_PRESETS = [
  'L0 - Day 1 Workshop',
  'L0 - Day 2 Workshop',
  'L1 - Day 1',
  'L1 - Day 2',
  'Event Day 1',
  'Event Day 2',
  'Event Day 3',
  'Event Day 4',
] as const;

const CALL_SESSION_TYPE_OPTIONS: Array<{ value: CallSessionType; label: string }> = [
  { value: 'main', label: 'Main Call' },
  { value: 'doubt1', label: 'Doubt Call 1' },
  { value: 'doubt2', label: 'Doubt Call 2' },
];

// ─── CSV export helper ────────────────────────────────────────────────────────
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function groupCallSessions(calls: CallSession[]): CallGroup[] {
  const groups = new Map<string, CallGroup>();

  sortCallSessions(calls).forEach((call) => {
    const key = getCallSessionGroupKey(call);
    const existing = groups.get(key);

    if (existing) {
      existing.sessions.push(call);
      return;
    }

    groups.set(key, {
      key,
      name: call.name,
      date: call.date,
      order: call.order,
      sessions: [call],
    });
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    sessions: sortCallSessions(group.sessions),
  }));
}

// ─── Helper: upsert call report ────────────────────────────────────────────────
async function upsertReport(
  existing: LeadCallReport | undefined,
  batchId: string,
  leadId: string,
  callSessionId: string,
  patch: Partial<LeadCallReport>,
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
      handlerId: null,
      customFieldValues: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...patch,
    } as Omit<LeadCallReport, 'id'>);
  }
}

// ─── Calls section ────────────────────────────────────────────────────────────
function CallsTab({
  batchId, programId, levelId,
}: { batchId: string; programId: string; levelId: string }) {
  const { calls, loading } = useCallSessions(batchId);
  const { templates } = useCallTemplates(levelId);
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateForDates, setTemplateForDates] = useState<CallTemplate | null>(null);
  const [editingGroup, setEditingGroup] = useState<CallGroup | null>(null);
  const callGroups = groupCallSessions(calls);

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist';

  async function handleCreate(date: string, name: string, sessionTypes: CallSessionType[]) {
    const trimmedName = name.trim();
    const normalizedName = trimmedName.toLowerCase();

    if (calls.some((call) => call.date === date && call.name.trim().toLowerCase() === normalizedName)) {
      toast.error('A call with this date and name already exists');
      return;
    }

    const nextOrder = calls.length === 0 ? 0 : Math.max(...calls.map((call) => call.order)) + 1;
    const write = writeBatch(db);
    const now = new Date().toISOString();

    sessionTypes.forEach((sessionType) => {
      const ref = doc(collection(db, 'callSessions'));
      write.set(ref, {
        batchId,
        programId,
        levelId,
        date,
        name: trimmedName,
        order: nextOrder,
        sessionType,
        createdAt: now,
        updatedAt: now,
        createdBy: user!.uid,
      });
    });

    await write.commit();
    toast.success('Call added');
  }

  // Called after user assigns dates to template entries
  async function handleCreateFromTemplate(entries: Array<{ name: string; date: string; sessionTypes: CallSessionType[] }>) {
    const baseOrder = calls.length === 0 ? 0 : Math.max(...calls.map((c) => c.order)) + 1;
    const write = writeBatch(db);
    const now = new Date().toISOString();

    entries.forEach((entry, idx) => {
      entry.sessionTypes.forEach((sessionType) => {
        const ref = doc(collection(db, 'callSessions'));
        write.set(ref, {
          batchId,
          programId,
          levelId,
          date: entry.date,
          name: entry.name,
          order: baseOrder + idx,
          sessionType,
          createdAt: now,
          updatedAt: now,
          createdBy: user!.uid,
        });
      });
    });

    await write.commit();
    toast.success(`${entries.length} call${entries.length !== 1 ? 's' : ''} created from template!`);
  }

  async function handleDelete(group: CallGroup) {
    if (!confirm('Delete this call and all of its sub-sessions?')) return;

    const write = writeBatch(db);
    group.sessions.forEach((session) => {
      write.delete(doc(db, 'callSessions', session.id));
    });

    await write.commit();
    toast.success('Deleted');
  }

  async function handleEdit(
    group: CallGroup,
    newDate: string,
    newName: string,
    newSessionTypes: CallSessionType[],
  ) {
    const write = writeBatch(db);
    const now = new Date().toISOString();
    const trimmedName = newName.trim();

    const existingTypes = group.sessions.map((s) => s.sessionType ?? 'main');
    const toKeep = group.sessions.filter((s) => newSessionTypes.includes(s.sessionType ?? 'main'));
    const toRemove = group.sessions.filter((s) => !newSessionTypes.includes(s.sessionType ?? 'main'));
    const toAdd = newSessionTypes.filter((st) => !existingTypes.includes(st));

    toKeep.forEach((session) => {
      write.update(doc(db, 'callSessions', session.id), { date: newDate, name: trimmedName, updatedAt: now });
    });
    toRemove.forEach((session) => {
      write.delete(doc(db, 'callSessions', session.id));
    });
    toAdd.forEach((sessionType) => {
      const ref = doc(collection(db, 'callSessions'));
      write.set(ref, {
        batchId, programId, levelId,
        date: newDate,
        name: trimmedName,
        order: group.order,
        sessionType,
        createdAt: now,
        updatedAt: now,
        createdBy: user!.uid,
      });
    });

    await write.commit();
    toast.success('Call updated');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-200">Calls</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setShowTemplatePicker(true)}>
                <ClipboardList size={14} /> From Template
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add Call
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : callGroups.length === 0 ? (
        <div className="text-center py-10">
          <Phone size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No calls configured yet</p>
          {canEdit && templates.length > 0 && (
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              Load from a template
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {callGroups.map((group) => (
            <div key={group.key} className="rounded-2xl border border-white/8 bg-white/3 p-4">
              <div className="flex items-start gap-3">
                <Phone size={14} className="text-indigo-400 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{group.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(group.date)}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {group.sessions.map((session) => (
                      <Badge key={session.id} variant="info">{getCallSessionTypeLabel(session.sessionType)}</Badge>
                    ))}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingGroup(group)}
                      className="text-slate-600 hover:text-indigo-400 transition-colors p-1"
                      title="Edit call"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(group)}
                      className="text-slate-600 hover:text-red-400 transition-colors p-1"
                      title="Delete call"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add single call */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Call">
        <CallForm onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>

      {/* Step 1 — Pick a template */}
      <Modal open={showTemplatePicker} onClose={() => setShowTemplatePicker(false)} title="Pick a Call Template" size="md">
        <TemplatePicker
          templates={templates}
          onPick={(t) => { setShowTemplatePicker(false); setTemplateForDates(t); }}
          onClose={() => setShowTemplatePicker(false)}
        />
      </Modal>

      {/* Edit existing call */}
      <Modal
        open={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        title="Edit Call"
      >
        {editingGroup && (
          <EditCallForm
            group={editingGroup}
            onSave={async (newDate, newName, newSessionTypes) => {
              await handleEdit(editingGroup, newDate, newName, newSessionTypes);
              setEditingGroup(null);
            }}
            onClose={() => setEditingGroup(null)}
          />
        )}
      </Modal>

      {/* Step 2 — Assign dates */}
      <Modal
        open={!!templateForDates}
        onClose={() => setTemplateForDates(null)}
        title={`Assign Dates — ${templateForDates?.templateName ?? ''}`}
        size="lg"
      >
        {templateForDates && (
          <TemplateDateAssigner
            template={templateForDates}
            onSave={async (entries) => {
              await handleCreateFromTemplate(entries);
              setTemplateForDates(null);
            }}
            onClose={() => setTemplateForDates(null)}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Template Picker ─────────────────────────────────────────────────────────
function TemplatePicker({
  templates,
  onPick,
  onClose,
}: {
  templates: CallTemplate[];
  onPick: (t: CallTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t)}
          className="w-full text-left rounded-xl border border-white/8 bg-white/3 p-4 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 flex-shrink-0 group-hover:bg-indigo-500/25">
              <ClipboardList size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-200 text-sm">{t.templateName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.entries.length} call{t.entries.length !== 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {t.entries.map((e, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{e.name}</span>
                ))}
              </div>
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" />
          </div>
        </button>
      ))}
      <div className="flex justify-end pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Template Date Assigner ───────────────────────────────────────────────────
function TemplateDateAssigner({
  template,
  onSave,
  onClose,
}: {
  template: CallTemplate;
  onSave: (entries: Array<{ name: string; date: string; sessionTypes: CallSessionType[] }>) => Promise<void>;
  onClose: () => void;
}) {
  const [dates, setDates] = useState<string[]>(template.entries.map(() => ''));
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const allFilled = dates.every((d) => d);
    if (!allFilled) { toast.error('Please fill in all dates'); return; }
    setLoading(true);
    try {
      await onSave(
        template.entries.map((entry, i) => ({
          name: entry.name,
          date: dates[i],
          sessionTypes: entry.sessionTypes,
        })),
      );
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <p className="text-sm text-slate-400">Assign a date to every call in this template.</p>
      <div className="space-y-3">
        {template.entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-200">{entry.name}</p>
              <div className="flex gap-1 mt-1">
                {entry.sessionTypes.map((st) => (
                  <span key={st} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
                    {st === 'main' ? 'Main' : st === 'doubt1' ? 'Doubt 1' : 'Doubt 2'}
                  </span>
                ))}
              </div>
            </div>
            <input
              type="date"
              required
              value={dates[i]}
              onChange={(ev) => setDates((prev) => prev.map((d, idx) => idx === i ? ev.target.value : d))}
              className="input-glass w-42 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">
          Create {template.entries.length} Call{template.entries.length !== 1 ? 's' : ''}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function CallForm({
  onSave,
  onClose,
}: {
  onSave: (date: string, name: string, sessionTypes: CallSessionType[]) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState('');
  // 'preset' or 'other'
  const [nameMode, setNameMode] = useState<'preset' | 'other'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<string>(CALL_NAME_PRESETS[0]);
  const [customName, setCustomName] = useState('');
  const [sessionTypes, setSessionTypes] = useState<Record<CallSessionType, boolean>>({
    main: true,
    doubt1: false,
    doubt2: false,
  });
  const [loading, setLoading] = useState(false);

  const finalName = nameMode === 'preset' ? selectedPreset : customName.trim();

  function toggleSessionType(sessionType: CallSessionType) {
    setSessionTypes((current) => ({
      ...current,
      [sessionType]: !current[sessionType],
    }));
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !finalName) return;
    const selectedSessionTypes = CALL_SESSION_TYPE_OPTIONS
      .filter((option) => sessionTypes[option.value])
      .map((option) => option.value);

    if (selectedSessionTypes.length === 0) {
      toast.error('Select at least one sub-session');
      return;
    }

    setLoading(true);
    try { await onSave(date, finalName, selectedSessionTypes); onClose(); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

      {/* Name selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Call Name</p>
        {/* Preset tiles */}
        <div className="grid grid-cols-2 gap-2">
          {CALL_NAME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => { setNameMode('preset'); setSelectedPreset(preset); }}
              className={`text-left px-3 py-2 rounded-xl border text-sm transition-all duration-150 ${
                nameMode === 'preset' && selectedPreset === preset
                  ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                  : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/15 hover:text-slate-200'
              }`}
            >
              {preset}
            </button>
          ))}
          {/* Other tile */}
          <button
            type="button"
            onClick={() => setNameMode('other')}
            className={`text-left px-3 py-2 rounded-xl border text-sm transition-all duration-150 ${
              nameMode === 'other'
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/15 hover:text-slate-200'
            }`}
          >
            Other (custom)
          </button>
        </div>
        {/* Custom name input — only shown when Other is selected */}
        {nameMode === 'other' && (
          <Input
            label="Enter custom name"
            placeholder="e.g. Special Session"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            required
          />
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Subheaders</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CALL_SESSION_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-sm text-slate-300"
            >
              <input
                type="checkbox"
                checked={sessionTypes[option.value]}
                onChange={() => toggleSessionType(option.value)}
                className="h-4 w-4 rounded border-white/10 bg-slate-950 text-indigo-400"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Add Call</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Edit Call Form ────────────────────────────────────────────────────────────
function EditCallForm({
  group,
  onSave,
  onClose,
}: {
  group: CallGroup;
  onSave: (newDate: string, newName: string, sessionTypes: CallSessionType[]) => Promise<void>;
  onClose: () => void;
}) {
  const existingTypes = group.sessions.map((s) => s.sessionType ?? 'main');
  const isPreset = (CALL_NAME_PRESETS as readonly string[]).includes(group.name);
  const [date, setDate] = useState(group.date);
  const [nameMode, setNameMode] = useState<'preset' | 'other'>(isPreset ? 'preset' : 'other');
  const [selectedPreset, setSelectedPreset] = useState(isPreset ? group.name : CALL_NAME_PRESETS[0]);
  const [customName, setCustomName] = useState(isPreset ? '' : group.name);
  const [sessionTypes, setSessionTypes] = useState<Record<CallSessionType, boolean>>({
    main: existingTypes.includes('main'),
    doubt1: existingTypes.includes('doubt1'),
    doubt2: existingTypes.includes('doubt2'),
  });
  const [loading, setLoading] = useState(false);

  const finalName = nameMode === 'preset' ? selectedPreset : customName.trim();

  function toggleSessionType(st: CallSessionType) {
    setSessionTypes((curr) => ({ ...curr, [st]: !curr[st] }));
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !finalName) return;
    const selected = CALL_SESSION_TYPE_OPTIONS.filter((o) => sessionTypes[o.value]).map((o) => o.value);
    if (selected.length === 0) { toast.error('Select at least one sub-session'); return; }
    setLoading(true);
    try { await onSave(date, finalName, selected); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Call Name</p>
        <div className="grid grid-cols-2 gap-2">
          {CALL_NAME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => { setNameMode('preset'); setSelectedPreset(preset); }}
              className={`text-left px-3 py-2 rounded-xl border text-sm transition-all duration-150 ${
                nameMode === 'preset' && selectedPreset === preset
                  ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                  : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/15 hover:text-slate-200'
              }`}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNameMode('other')}
            className={`text-left px-3 py-2 rounded-xl border text-sm transition-all duration-150 ${
              nameMode === 'other'
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/15 hover:text-slate-200'
            }`}
          >
            Other (custom)
          </button>
        </div>
        {nameMode === 'other' && (
          <Input
            label="Custom name"
            placeholder="e.g. Special Session"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            required
          />
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Subheaders</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CALL_SESSION_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-sm text-slate-300"
            >
              <input
                type="checkbox"
                checked={sessionTypes[option.value]}
                onChange={() => toggleSessionType(option.value)}
                className="h-4 w-4 rounded border-white/10 bg-slate-950 text-indigo-400"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Save Changes</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Custom Fields section ─────────────────────────────────────────────────────
function FieldsTab({ batchId }: { batchId: string }) {
  const { fields, loading } = useCustomFields(batchId);
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);

  async function handleCreate(label: string, type: CustomFieldType, options: string[]) {
    await createDocument<Omit<CustomField, 'id'>>('customFields', {
      batchId, label, type,
      options: type === 'dropdown' ? options : undefined,
      order: fields.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user!.uid,
    });
    toast.success('Field added!');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this custom field?')) return;
    await deleteDocument('customFields', id);
    toast.success('Deleted');
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const a = fields[index];
    const b = fields[index - 1];
    await Promise.all([
      updateDocument('customFields', a.id, { order: b.order }),
      updateDocument('customFields', b.id, { order: a.order }),
    ]);
  }

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-200">Custom Fields</h3>
        {canEdit && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Field
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : fields.length === 0 ? (
        <div className="text-center py-10">
          <Settings2 size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No custom fields configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/6">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">{f.label}</p>
                <p className="text-xs text-slate-500 capitalize">{f.type}</p>
                {f.options && f.options.length > 0 && (
                  <p className="text-xs text-slate-600 mt-0.5">{f.options.join(', ')}</p>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleMoveUp(i)} className="text-slate-600 hover:text-slate-300 transition-colors p-1" title="Move up">↑</button>
                  <button onClick={() => handleDelete(f.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Custom Field">
        <CustomFieldForm onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
  );
}

function CustomFieldForm({
  onSave, onClose,
}: {
  onSave: (label: string, type: CustomFieldType, options: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [optionsStr, setOptionsStr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const options = type === 'dropdown' ? optionsStr.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    setLoading(true);
    try { await onSave(label.trim(), type, options); onClose(); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Field Label" placeholder="e.g. Zoom Link Sent" value={label} onChange={(e) => setLabel(e.target.value)} required />
      <Select
        label="Field Type"
        value={type}
        onChange={(e) => setType(e.target.value as CustomFieldType)}
        options={[
          { value: 'text', label: 'Text' },
          { value: 'dropdown', label: 'Dropdown' },
          { value: 'checkbox', label: 'Checkbox' },
          { value: 'date', label: 'Date' },
        ]}
      />
      {type === 'dropdown' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-300">Options (one per line)</label>
          <textarea
            className="input-glass min-h-[90px] resize-none"
            placeholder={"Option 1\nOption 2\nOption 3"}
            value={optionsStr}
            onChange={(e) => setOptionsStr(e.target.value)}
          />
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Add Field</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Leads section ─────────────────────────────────────────────────────────────
function LeadsTab({
  batchId, programId, levelId, levelName,
}: { batchId: string; programId: string; levelId: string; levelName: string }) {
  const { leads, loading } = useLeads(batchId);
  const { users: assistants } = useUsers('backend_assist');
  const { user } = useAuth();
  const [showImport, setShowImport] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [promotingLead, setPromotingLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const assistantOptions = assistants.map((a) => ({ value: a.uid, label: a.displayName }));

  function getHandlerName(handlerId: string | null) {
    if (!handlerId) return null;
    return assistants.find((a) => a.uid === handlerId)?.displayName ?? null;
  }

  function getUniqueLeadKey(email: string) {
    return email.trim().toLowerCase();
  }

  function hasDuplicateLead(email: string, excludeId?: string) {
    const key = getUniqueLeadKey(email);
    if (!key) return false;
    return leads.some((l) => {
      if (l.id === excludeId) return false;
      return getUniqueLeadKey(l.email ?? '') === key;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  }

  async function handleDistribute() {
    if (assistants.length === 0) { toast.error('No backend assist users found'); return; }
    if (!confirm(`Redistribute ${leads.length} leads among ${assistants.length} assist(s)?`)) return;
    const distributed = distributeLeads(
      leads.map((l) => ({ id: l.id })),
      assistants.map((a) => ({ uid: a.uid, displayName: a.displayName })),
    );
    const ops = distributed.map((d) => ({
      type: 'update' as const,
      path: 'leads',
      id: d.id,
      data: { handlerId: d.handlerId, handlerName: d.handlerName },
    }));
    await batchWrite(ops);
    toast.success('Leads distributed!');
  }

  async function handleCSVImport(
    rows: Record<string, string>[],
    mapping: { name: string; email: string; phone: string },
  ) {
    const batch = writeBatch(db);
    const existingKeys = new Set(
      leads.map((l) => getUniqueLeadKey(l.email ?? '')).filter(Boolean),
    );
    let addedCount = 0;

    rows.forEach((row) => {
      const name = (mapping.name ? (row[mapping.name] ?? '') : '').trim();
      const email = (mapping.email ? (row[mapping.email] ?? '') : '').trim();
      const phone = (mapping.phone ? (row[mapping.phone] ?? '') : '').trim();

      if (!name && !email && !phone) return;

      const uniqueKey = getUniqueLeadKey(email);
      if (uniqueKey && existingKeys.has(uniqueKey)) return;

      const ref = doc(collection(db, 'leads'));
      batch.set(ref, {
        batchId, programId, levelId,
        name,
        email: email.toLowerCase(),
        phone,
        handlerId: null,
        handlerName: null,
        serialNumber: leads.length + addedCount + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'import',
      });
      if (uniqueKey) existingKeys.add(uniqueKey);
      addedCount += 1;
    });

    if (addedCount === 0) {
      toast.error('No new leads found — all rows already exist or have no data in mapped columns');
      return;
    }

    await batch.commit();
    toast.success(`Imported ${addedCount} leads`);
    setShowImport(false);
  }

  async function handleAddSingle(name: string, email: string, phone: string, handlerId: string | null) {
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (hasDuplicateLead(email)) {
      toast.error('A lead with this email already exists in this batch');
      return;
    }
    await createDocument<Omit<Lead, 'id'>>('leads', {
      batchId, programId, levelId,
      name, email: email.toLowerCase(), phone,
      handlerId,
      handlerName: getHandlerName(handlerId),
      serialNumber: leads.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'manual',
    });
    toast.success('Lead added!');
  }

  async function handleDeleteLead(id: string) {
    if (!confirm('Delete this lead?')) return;
    const remaining = leads
      .filter((l) => l.id !== id)
      .sort((a, b) => a.serialNumber - b.serialNumber);
    const write = writeBatch(db);
    write.delete(doc(db, 'leads', id));
    remaining.forEach((lead, i) => {
      if (lead.serialNumber !== i + 1) {
        write.update(doc(db, 'leads', lead.id), { serialNumber: i + 1, updatedAt: new Date().toISOString() });
      }
    });
    await write.commit();
    toast.success('Lead deleted');
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected lead(s)?`)) return;
    const remaining = leads
      .filter((l) => !selectedIds.has(l.id))
      .sort((a, b) => a.serialNumber - b.serialNumber);
    const write = writeBatch(db);
    selectedIds.forEach((id) => write.delete(doc(db, 'leads', id)));
    remaining.forEach((lead, i) => {
      if (lead.serialNumber !== i + 1) {
        write.update(doc(db, 'leads', lead.id), { serialNumber: i + 1, updatedAt: new Date().toISOString() });
      }
    });
    await write.commit();
    toast.success(`Deleted ${selectedIds.size} lead(s)`);
    setSelectedIds(new Set());
  }

  async function handleEditLead(name: string, email: string, phone: string, handlerId: string | null) {
    if (!editingLead) return;
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (hasDuplicateLead(email, editingLead.id)) {
      toast.error('A lead with this email already exists in this batch');
      return;
    }
    await updateDocument('leads', editingLead.id, {
      name,
      email: email.toLowerCase(),
      phone,
      handlerId,
      handlerName: getHandlerName(handlerId),
    });
    toast.success('Lead updated');
    setEditingLead(null);
  }

  async function handleAssignLead(leadId: string, handlerId: string) {
    const resolvedHandlerId = handlerId || null;
    await updateDocument('leads', leadId, {
      handlerId: resolvedHandlerId,
      handlerName: getHandlerName(resolvedHandlerId),
    });
    toast.success('Lead assignment updated');
  }

  async function handleToggleTag(lead: Lead, type: 'deposit' | 'won') {
    const currentTags: LeadTag[] = lead.tags ?? [];
    const existingIdx = currentTags.findIndex((t) => t.type === type && t.levelId === levelId);
    let newTags: LeadTag[];
    if (existingIdx >= 0) {
      newTags = currentTags.filter((_, i) => i !== existingIdx);
    } else {
      newTags = [...currentTags, { type, levelId, levelName: levelName || levelId, addedAt: new Date().toISOString() }];
    }
    await updateDocument<Lead>('leads', lead.id, { tags: newTags });
  }

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist';
  const canExport = user?.role === 'admin' || user?.role === 'backend_manager';

  function handleExportLeads() {
    const rows = leads.map((lead) => ({
      'Sr.': lead.serialNumber,
      'Name': lead.name,
      'Email': lead.email,
      'Phone': lead.phone,
      'Handler': lead.handlerName ?? '',
      'Source': lead.source,
      'Tags': (lead.tags ?? []).map((t) => `${t.type === 'won' ? 'Won' : 'Deposit'} (${t.levelName})`).join('; '),
    }));
    downloadCSV(Papa.unparse(rows), `leads-${batchId}.csv`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-slate-200">
          Leads <span className="text-slate-500 font-normal">({leads.length})</span>
        </h3>
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="danger" onClick={handleDeleteSelected}>
                <Trash2 size={14} /> Delete ({selectedIds.size})
              </Button>
            )}
            {canExport && leads.length > 0 && (
              <Button size="sm" variant="secondary" onClick={handleExportLeads}>
                <Download size={14} /> Export CSV
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={handleDistribute}>
              <RefreshCw size={14} /> Distribute
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}>
              <Upload size={14} /> Import CSV
            </Button>
            <Button size="sm" onClick={() => setShowImport(true)}>
              <Plus size={14} /> Add Lead
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="text-center py-10">
          <Users size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No leads yet — import a CSV or add manually</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/8">
          <table className="table-glass w-full">
            <thead>
              <tr>
                <th className="w-16"></th>
                {canEdit && (
                  <th className="w-8">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/10 bg-slate-950 text-indigo-400 cursor-pointer"
                      checked={leads.length > 0 && selectedIds.size === leads.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th>Sr.</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Handler</th>
                <th>Source</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className={selectedIds.has(lead.id) ? 'bg-indigo-500/5' : ''}>
                  {/* Tag action icons */}
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        title={lead.tags?.some((t) => t.type === 'deposit' && t.levelId === levelId) ? 'Remove Deposit tag' : 'Mark Deposit Paid'}
                        onClick={() => handleToggleTag(lead, 'deposit')}
                        className={`p-1.5 rounded-lg transition-all ${
                          lead.tags?.some((t) => t.type === 'deposit' && t.levelId === levelId)
                            ? 'text-amber-400 bg-amber-500/15 hover:bg-amber-500/25'
                            : 'text-slate-600 hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <TrendingUp size={13} />
                      </button>
                      <button
                        title={lead.tags?.some((t) => t.type === 'won' && t.levelId === levelId) ? 'Remove Won tag' : 'Mark Won'}
                        onClick={() => handleToggleTag(lead, 'won')}
                        className={`p-1.5 rounded-lg transition-all ${
                          lead.tags?.some((t) => t.type === 'won' && t.levelId === levelId)
                            ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25'
                            : 'text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        <Trophy size={13} />
                      </button>
                    </div>
                  </td>
                  {canEdit && (
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-indigo-400 cursor-pointer"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                      />
                    </td>
                  )}
                  <td className="text-slate-500">{lead.serialNumber}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-200">{lead.name}</span>
                      {lead.tags && lead.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {lead.tags.map((tag, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                                tag.type === 'won'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                              }`}
                            >
                              {tag.type === 'won' ? <Trophy size={9} /> : <TrendingUp size={9} />}
                              {tag.type === 'won' ? 'Won' : 'Deposit'} · {tag.levelName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="text-slate-400">{lead.email}</td>
                  <td className="text-slate-400">{lead.phone}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="input-glass py-1.5 text-xs cursor-pointer min-w-[150px]"
                        value={lead.handlerId ?? ''}
                        onChange={(e) => handleAssignLead(lead.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {assistantOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : lead.handlerName ? (
                      <Badge variant="info">{lead.handlerName}</Badge>
                    ) : (
                      <Badge variant="warning">Unassigned</Badge>
                    )}
                  </td>
                  <td>
                    <Badge variant={lead.source === 'api' ? 'purple' : lead.source === 'import' ? 'success' : 'default'}>
                      {lead.source}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPromotingLead(lead)}
                          className="p-1.5 text-slate-500 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/10"
                          title="Promote / demote to another level"
                        >
                          <ChevronsUp size={13} />
                        </button>
                        <button
                          onClick={() => setEditingLead(lead)}
                          className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-500/10"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Add Leads" size="lg" solid>
        <LeadImportForm
          onCSVImport={handleCSVImport}
          onManual={handleAddSingle}
          assistants={assistantOptions}
          onClose={() => setShowImport(false)}
        />
      </Modal>

      <Modal open={!!editingLead} onClose={() => setEditingLead(null)} title="Edit Lead" solid>
        {editingLead && (
          <LeadEditForm
            initial={editingLead}
            onSave={handleEditLead}
            assistants={assistantOptions}
            onClose={() => setEditingLead(null)}
          />
        )}
      </Modal>

      <Modal open={!!promotingLead} onClose={() => setPromotingLead(null)} title="Promote / Demote Lead" solid>
        {promotingLead && (
          <PromoteLeadModal
            lead={promotingLead}
            programId={programId}
            currentLevelId={levelId}
            onClose={() => setPromotingLead(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function LeadEditForm({
  initial,
  onSave,
  assistants,
  onClose,
}: {
  initial: Lead;
  onSave: (name: string, email: string, phone: string, handlerId: string | null) => Promise<void>;
  assistants: { value: string; label: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [handlerId, setHandlerId] = useState(initial.handlerId ?? '');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try { await onSave(name.trim(), email.trim(), phone.trim(), handlerId || null); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Select
        label="Assign Backend Assist"
        value={handlerId}
        onChange={(e) => setHandlerId(e.target.value)}
        placeholder="Unassigned"
        options={assistants}
      />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Save Changes</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function LeadImportForm({
  onCSVImport, onManual, assistants, onClose,
}: {
  onCSVImport: (rows: Record<string, string>[], mapping: { name: string; email: string; phone: string }) => Promise<void>;
  onManual: (name: string, email: string, phone: string, handlerId: string | null) => Promise<void>;
  assistants: { value: string; label: string }[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  // Manual form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [handlerId, setHandlerId] = useState('');
  // CSV state
  const [csvStep, setCsvStep] = useState<'upload' | 'mapping'>('upload');
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<{ name: string; email: string; phone: string }>({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function autoDetect(headers: string[]) {
    const find = (patterns: RegExp[]) => headers.find((h) => patterns.some((p) => p.test(h.trim()))) ?? '';
    return {
      name: find([/^name$/i, /^full.?name$/i, /^student.?name$/i, /^lead.?name$/i]),
      email: find([/^email$/i, /^e.?mail$/i, /^email.?address$/i]),
      phone: find([/^phone$/i, /^phone.?number$/i, /^mobile$/i, /^mobile.?number$/i, /^contact$/i, /^number$/i]),
    };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const headers = (results.meta.fields ?? []) as string[];
        setCsvRows(rows);
        setCsvHeaders(headers);
        setCsvMapping(autoDetect(headers));
        setCsvStep('mapping');
        setLoading(false);
      },
      error: () => {
        toast.error('Could not parse CSV');
        setLoading(false);
      },
    });
    e.target.value = '';
  }

  async function handleManual(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try { await onManual(name.trim(), email.trim(), phone.trim(), handlerId || null); onClose(); }
    finally { setLoading(false); }
  }

  async function handleImport() {
    if (!csvMapping.name && !csvMapping.email && !csvMapping.phone) {
      toast.error('Map at least one column (name, email, or phone) to import');
      return;
    }
    setLoading(true);
    try { await onCSVImport(csvRows, csvMapping); }
    finally { setLoading(false); }
  }

  const mappingOptions = [{ value: '', label: '— Not mapped —' }, ...csvHeaders.map((h) => ({ value: h, label: h }))];
  const extraHeaders = csvHeaders.filter((h) => h !== csvMapping.name && h !== csvMapping.email && h !== csvMapping.phone);

  // ── CSV mapping step ────────────────────────────────────────────────────────
  if (mode === 'csv' && csvStep === 'mapping') {
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-slate-300">
          <span className="text-emerald-400 font-semibold">{csvRows.length} rows</span> detected in CSV.
          {' '}Map each column to the correct lead field below.
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Name column"
            value={csvMapping.name}
            onChange={(e) => setCsvMapping((prev) => ({ ...prev, name: e.target.value }))}
            options={mappingOptions}
          />
          <Select
            label="Email column"
            value={csvMapping.email}
            onChange={(e) => setCsvMapping((prev) => ({ ...prev, email: e.target.value }))}
            options={mappingOptions}
          />
          <Select
            label="Phone column"
            value={csvMapping.phone}
            onChange={(e) => setCsvMapping((prev) => ({ ...prev, phone: e.target.value }))}
            options={mappingOptions}
          />
        </div>

        {extraHeaders.length > 0 && (
          <div className="p-3 rounded-xl bg-white/3 border border-white/8 text-xs text-slate-500">
            <p className="font-medium text-slate-400 mb-1">Extra columns (will be ignored):</p>
            <p className="flex flex-wrap gap-1">
              {extraHeaders.map((h) => (
                <span key={h} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/8">{h}</span>
              ))}
            </p>
          </div>
        )}

        {csvRows.length > 0 && (csvMapping.name || csvMapping.email || csvMapping.phone) && (
          <div className="rounded-xl bg-white/3 border border-white/8 overflow-hidden text-xs">
            <p className="px-3 py-2 font-medium text-slate-400 border-b border-white/8">Preview (first 3 rows)</p>
            <div className="divide-y divide-white/5">
              {csvRows.slice(0, 3).map((row, i) => (
                <div key={i} className="px-3 py-2 flex gap-4 text-slate-500">
                  {csvMapping.name && <span className="text-slate-300 font-medium">{row[csvMapping.name]}</span>}
                  {csvMapping.email && <span>{row[csvMapping.email]}</span>}
                  {csvMapping.phone && <span>{row[csvMapping.phone]}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button className="flex-1" onClick={handleImport} loading={loading}>
            Import {csvRows.length} Leads
          </Button>
          <Button variant="secondary" onClick={() => { setCsvStep('upload'); setCsvRows([]); setCsvHeaders([]); }}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // ── Default view (manual / csv upload) ─────────────────────────────────────
  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setMode('manual')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-500 hover:text-slate-300'}`}>
          Manual
        </button>
        <button onClick={() => setMode('csv')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'csv' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-500 hover:text-slate-300'}`}>
          Import CSV
        </button>
      </div>

      {mode === 'manual' ? (
        <form onSubmit={handleManual} className="space-y-4">
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select
            label="Assign Backend Assist"
            value={handlerId}
            onChange={(e) => setHandlerId(e.target.value)}
            placeholder="Unassigned"
            options={assistants}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading} className="flex-1">Add Lead</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm text-slate-400">
            Upload any CSV file — column names will be auto-detected and you can remap them if needed before importing.
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <Button className="w-full" onClick={() => fileRef.current?.click()} loading={loading}>
            <Upload size={16} /> Choose CSV File
          </Button>
          <Button type="button" variant="secondary" className="w-full" onClick={onClose}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

// ─── Zoom Registration Upload ─────────────────────────────────────────────────
function ZoomRegistrationForm({
  callGroups,
  leads,
  batchId,
  reportMap,
  onComplete,
  onClose,
}: {
  callGroups: CallGroup[];
  leads: Lead[];
  batchId: string;
  reportMap: Map<string, LeadCallReport>;
  onComplete: (unmatched: Array<{ name: string; email: string; phone: string }>) => void;
  onClose: () => void;
}) {
  const mainSessions = callGroups.flatMap((g) =>
    g.sessions
      .filter((s) => s.sessionType === 'main' || !s.sessionType)
      .map((s) => ({ ...s, groupName: g.name, groupDate: g.date })),
  );

  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [selectedSessionId, setSelectedSessionId] = useState(mainSessions[0]?.id ?? '');
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({ name: '', email: '', phone: '' });
  const [previewData, setPreviewData] = useState<{
    matched: Lead[];
    unmatched: Array<{ name: string; email: string; phone: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function autoDetect(headers: string[]) {
    const find = (patterns: RegExp[]) => headers.find((h) => patterns.some((p) => p.test(h.trim()))) ?? '';
    return {
      name: find([/^(first.?name|name|full.?name|attendee.?name)$/i]),
      email: find([/^(email|e.?mail|email.?address|user.?email)$/i]),
      phone: find([/^(phone|phone.?number|mobile|mobile.?number|contact)$/i]),
    };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const headers = (results.meta.fields ?? []) as string[];
        setCsvRows(rows);
        setCsvHeaders(headers);
        setMapping(autoDetect(headers));
        setStep('mapping');
        setLoading(false);
      },
      error: () => {
        toast.error('Could not parse file');
        setLoading(false);
      },
    });
    e.target.value = '';
  }

  function computeMatches() {
    const leadByEmail = new Map<string, Lead>();
    const leadByPhone = new Map<string, Lead>();
    leads.forEach((lead) => {
      if (lead.email) leadByEmail.set(lead.email.trim().toLowerCase(), lead);
      if (lead.phone) {
        const normalized = lead.phone.replace(/\D/g, '');
        if (normalized) leadByPhone.set(normalized, lead);
      }
    });

    const matched: Lead[] = [];
    const matchedIds = new Set<string>();
    const unmatched: Array<{ name: string; email: string; phone: string }> = [];

    for (const row of csvRows) {
      const name = (mapping.name ? (row[mapping.name] ?? '') : '').trim();
      const email = (mapping.email ? (row[mapping.email] ?? '') : '').trim();
      const phone = (mapping.phone ? (row[mapping.phone] ?? '') : '').trim();

      const normalizedEmail = email.toLowerCase();
      const normalizedPhone = phone.replace(/\D/g, '');

      const lead =
        (normalizedEmail && leadByEmail.get(normalizedEmail)) ||
        (normalizedPhone && leadByPhone.get(normalizedPhone)) ||
        null;

      if (lead) {
        if (!matchedIds.has(lead.id)) {
          matched.push(lead);
          matchedIds.add(lead.id);
        }
      } else {
        unmatched.push({ name, email, phone });
      }
    }

    return { matched, unmatched };
  }

  function handlePreview() {
    if (!selectedSessionId) { toast.error('Select a call session'); return; }
    if (!mapping.email && !mapping.phone) {
      toast.error('Map at least an email or phone column to match leads');
      return;
    }
    const result = computeMatches();
    setPreviewData(result);
    setStep('preview');
  }

  async function handleConfirm() {
    if (!previewData || !selectedSessionId) return;
    setLoading(true);
    try {
      const wb = writeBatch(db);
      const now = new Date().toISOString();

      for (const lead of previewData.matched) {
        const key = `${lead.id}_${selectedSessionId}`;
        const existing = reportMap.get(key);

        if (existing) {
          wb.update(doc(db, 'callReports', existing.id), { registrationReport: 'Registered', updatedAt: now });
        } else {
          const ref = doc(collection(db, 'callReports'));
          wb.set(ref, {
            batchId,
            leadId: lead.id,
            callSessionId: selectedSessionId,
            registrationReport: 'Registered',
            callingAssistReport: null,
            callingAssistId: null,
            handlerReport: null,
            handlerId: null,
            customFieldValues: {},
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      await wb.commit();
      toast.success(`Marked ${previewData.matched.length} lead(s) as Registered`);
      onComplete(previewData.unmatched);
    } catch (err) {
      toast.error('Failed to update registrations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (mainSessions.length === 0) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-slate-400 text-sm">No main call sessions found. Add a main call session first.</p>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    );
  }

  // ── Step: upload ────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-5">
        <Select
          label="Call Session"
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value)}
          options={mainSessions.map((s) => ({
            value: s.id,
            label: `${formatDate(s.groupDate)} — ${s.groupName}`,
          }))}
        />
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm text-slate-400">
          Upload the Zoom registration CSV for this call. Registrants are matched to leads by
          {' '}<span className="text-indigo-300 font-medium">email</span> or{' '}
          <span className="text-indigo-300 font-medium">phone number</span> and marked as{' '}
          <span className="text-emerald-400 font-medium">Registered</span>.
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <Button className="w-full" onClick={() => fileRef.current?.click()} loading={loading}>
          <Upload size={16} /> Choose CSV File
        </Button>
        <Button variant="secondary" className="w-full" onClick={onClose}>Cancel</Button>
      </div>
    );
  }

  // ── Step: mapping ───────────────────────────────────────────────────────────
  if (step === 'mapping') {
    const mappingOptions = [{ value: '', label: '— Not mapped —' }, ...csvHeaders.map((h) => ({ value: h, label: h }))];
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-slate-300">
          <span className="text-emerald-400 font-semibold">{csvRows.length} rows</span> detected.
          {' '}Map the CSV columns to match against leads.
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Name column"
            value={mapping.name}
            onChange={(e) => setMapping((prev) => ({ ...prev, name: e.target.value }))}
            options={mappingOptions}
          />
          <Select
            label="Email column"
            value={mapping.email}
            onChange={(e) => setMapping((prev) => ({ ...prev, email: e.target.value }))}
            options={mappingOptions}
          />
          <Select
            label="Phone column"
            value={mapping.phone}
            onChange={(e) => setMapping((prev) => ({ ...prev, phone: e.target.value }))}
            options={mappingOptions}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button className="flex-1" onClick={handlePreview}>Preview Matches</Button>
          <Button variant="secondary" onClick={() => { setStep('upload'); setCsvRows([]); setCsvHeaders([]); }}>Back</Button>
        </div>
      </div>
    );
  }

  // ── Step: preview ───────────────────────────────────────────────────────────
  if (step === 'preview' && previewData) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <p className="text-3xl font-bold text-emerald-400">{previewData.matched.length}</p>
            <p className="text-xs text-slate-400 mt-1">Leads will be marked Registered</p>
          </div>
          <div className={`p-4 rounded-xl text-center ${previewData.unmatched.length > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-white/3 border border-white/8'}`}>
            <p className={`text-3xl font-bold ${previewData.unmatched.length > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
              {previewData.unmatched.length}
            </p>
            <p className="text-xs text-slate-400 mt-1">Registrations without a matching lead</p>
          </div>
        </div>

        {previewData.unmatched.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
            <p className="px-3 py-2 text-xs font-medium text-amber-400 border-b border-amber-500/20">
              Unmatched — will be shown below the report table after confirming
            </p>
            <div className="divide-y divide-amber-500/10 max-h-[180px] overflow-y-auto">
              {previewData.unmatched.map((r, i) => (
                <div key={i} className="px-3 py-1.5 text-xs text-slate-400 flex gap-4">
                  {r.name && <span className="text-slate-300 font-medium">{r.name}</span>}
                  {r.email && <span>{r.email}</span>}
                  {r.phone && <span>{r.phone}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1"
            onClick={handleConfirm}
            loading={loading}
            disabled={previewData.matched.length === 0}
          >
            Confirm &amp; Apply
          </Button>
          <Button variant="secondary" onClick={() => setStep('mapping')}>Back</Button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Report Table ─────────────────────────────────────────────────────────────
function ReportTab({ batchId, programId, levelId }: { batchId: string; programId: string; levelId: string }) {
  const { leads } = useLeads(batchId);
  const { calls } = useCallSessions(batchId);
  const { fields } = useCustomFields(batchId);
  const { reportMap } = useCallReports(batchId);
  const { user } = useAuth();
  const [selectedCallGroup, setSelectedCallGroup] = useState<string>('all');
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [zoomUnmatched, setZoomUnmatched] = useState<Array<{ name: string; email: string; phone: string }>>([]);
  const [editingUnmatchedIdx, setEditingUnmatchedIdx] = useState<number | null>(null);
  const [editingUnmatchedData, setEditingUnmatchedData] = useState<{ name: string; email: string; phone: string }>({ name: '', email: '', phone: '' });
  const callGroups = groupCallSessions(calls);

  function handleRemoveUnmatched(idx: number) {
    setZoomUnmatched((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleStartEditUnmatched(idx: number) {
    setEditingUnmatchedIdx(idx);
    setEditingUnmatchedData({ ...zoomUnmatched[idx] });
  }

  function handleSaveEditUnmatched() {
    if (editingUnmatchedIdx === null) return;
    setZoomUnmatched((prev) => prev.map((r, i) => i === editingUnmatchedIdx ? { ...editingUnmatchedData } : r));
    setEditingUnmatchedIdx(null);
  }

  async function handleAddUnmatchedAsLead(idx: number) {
    const entry = zoomUnmatched[idx];
    if (!entry.name && !entry.email && !entry.phone) {
      toast.error('Cannot add empty entry as lead');
      return;
    }
    await createDocument<Omit<Lead, 'id'>>('leads', {
      batchId,
      programId,
      levelId,
      name: entry.name,
      email: (entry.email || '').toLowerCase(),
      phone: entry.phone,
      handlerId: null,
      handlerName: null,
      serialNumber: leads.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'manual',
    });
    toast.success('Lead added!');
    handleRemoveUnmatched(idx);
  }

  useEffect(() => {
    if (selectedCallGroup !== 'all' && !callGroups.some((group) => group.key === selectedCallGroup)) {
      setSelectedCallGroup('all');
    }
  }, [callGroups, selectedCallGroup]);

  const displayGroups = selectedCallGroup === 'all'
    ? callGroups
    : callGroups.filter((group) => group.key === selectedCallGroup);

  function handleExportReport() {
    const rows = leads.map((lead) => {
      const row: Record<string, string> = {
        'Sr.': String(lead.serialNumber),
        'Name': lead.name,
        'Email': lead.email,
        'Phone': lead.phone,
        'Handler': lead.handlerName ?? '',
        'Tags': (lead.tags ?? []).map((t) => `${t.type === 'won' ? 'Won' : 'Deposit'} (${t.levelName})`).join('; '),
      };
      for (const group of displayGroups) {
        for (const session of group.sessions) {
          const isDoubt = session.sessionType === 'doubt1' || session.sessionType === 'doubt2';
          const prefix = `${group.name} | ${formatDate(group.date)} | ${getCallSessionTypeLabel(session.sessionType)}`;
          const rep = reportMap.get(`${lead.id}_${session.id}`);
          if (!isDoubt) {
            row[`${prefix} | Reg. Report`] = rep?.registrationReport ?? '';
            row[`${prefix} | Calling Assist`] = rep?.callingAssistReport ?? '';
          }
          row[`${prefix} | Handler`] = rep?.handlerReport ?? '';
          for (const f of fields) {
            row[`${prefix} | ${f.label}`] = rep?.customFieldValues?.[f.id] ?? '';
          }
        }
      }
      return row;
    });
    downloadCSV(Papa.unparse(rows), `report-${batchId}.csv`);
  }

  async function handleReportChange(
    lead: Lead,
    call: CallSession,
    field: keyof LeadCallReport | string,
    value: string,
  ) {
    const key = `${lead.id}_${call.id}`;
    const existing = reportMap.get(key);
    let patch: Partial<LeadCallReport>;

    if (field === 'callingAssistReport') {
      const autoHandler = value
        ? isCallingAssistRedFlag(value)
          ? "Don't Call Them"
          : 'Call Them'
        : null;
      patch = { callingAssistReport: (value as LeadCallReport['callingAssistReport']) || null, handlerReport: autoHandler as LeadCallReport['handlerReport'] };
    } else if (field === 'registrationReport' || field === 'handlerReport') {
      patch = { [field]: value || null };
    } else {
      patch = { customFieldValues: { ...(existing?.customFieldValues ?? {}), [field]: value } };
    }

    await upsertReport(existing, batchId, lead.id, call.id, patch);
  }

  if (leads.length === 0) return <p className="text-slate-500 text-sm">Add leads first to see the report table.</p>;
  if (calls.length === 0) return <p className="text-slate-500 text-sm">Add call sessions first.</p>;

  const canCallingAssist = user?.role === 'calling_assist' || user?.role === 'admin' || user?.role === 'backend_manager';
  const canHandler = user?.role === 'backend_assist' || user?.role === 'admin' || user?.role === 'backend_manager';

  const callingAssistLabel = user?.role === 'calling_assist'
    ? `${user.displayName} Report`
    : 'Calling Assist Report';

  function sessionColCount(session: CallSession) {
    const isDoubt = session.sessionType === 'doubt1' || session.sessionType === 'doubt2';
    return isDoubt ? 1 + fields.length : 3 + fields.length;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h3 className="font-semibold text-slate-200">Report Table</h3>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {(user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist') && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setShowZoomModal(true)}>
                <Upload size={14} /> Zoom Registration
              </Button>
              {leads.length > 0 && (
                <Button size="sm" variant="secondary" onClick={handleExportReport}>
                  <Download size={14} /> Export CSV
                </Button>
              )}
            </>
          )}
          <Select
            value={selectedCallGroup}
            onChange={(e) => setSelectedCallGroup(e.target.value)}
            options={[
              { value: 'all', label: 'All Calls' },
              ...callGroups.map((group) => ({ value: group.key, label: `${formatDate(group.date)} — ${group.name}` })),
            ]}
            className="text-xs"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="table-glass text-xs min-w-max">
          <thead>
            <tr>
              <th rowSpan={4} className="sticky left-0 z-10 bg-slate-950">Sr.</th>
              <th rowSpan={4} className="sticky left-[50px] z-10 bg-slate-950">Name</th>
              <th rowSpan={4}>Email</th>
              <th rowSpan={4}>Phone</th>
              <th rowSpan={4}>Handler</th>
              {displayGroups.map((group) => (
                <th key={`${group.key}_name`} colSpan={group.sessions.reduce((sum, s) => sum + sessionColCount(s), 0)} className="text-center border-l border-white/10">
                  {group.name}
                </th>
              ))}
            </tr>
            <tr>
              {displayGroups.map((group) => (
                <th key={`${group.key}_date`} colSpan={group.sessions.reduce((sum, s) => sum + sessionColCount(s), 0)} className="text-center border-l border-white/10 text-slate-400">
                  {formatDate(group.date)}
                </th>
              ))}
            </tr>
            <tr>
              {displayGroups.map((group) => (
                <React.Fragment key={`${group.key}_sessions`}>
                  {group.sessions.map((session) => (
                    <th key={`${session.id}_session`} colSpan={sessionColCount(session)} className="border-l border-white/10 text-center text-indigo-300/80">
                      {getCallSessionTypeLabel(session.sessionType)}
                    </th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
            <tr>
              {displayGroups.map((group) => (
                <React.Fragment key={`${group.key}_fields`}>
                  {group.sessions.map((session) => {
                    const isDoubt = session.sessionType === 'doubt1' || session.sessionType === 'doubt2';
                    return (
                      <React.Fragment key={`${session.id}_columns`}>
                        {!isDoubt && <th className="border-l border-white/10 text-indigo-300/80">Reg. Report</th>}
                        {!isDoubt && <th className="text-cyan-300/80">{callingAssistLabel}</th>}
                        <th className={isDoubt ? 'border-l border-white/10 text-purple-300/80' : 'text-purple-300/80'}>Handler Report</th>
                        {fields.map((field) => (
                          <th key={`${session.id}_${field.id}`} className="text-amber-300/80">{field.label}</th>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="sticky left-0 z-10 bg-[#0a0a1a]">{lead.serialNumber}</td>
                <td className="sticky left-[50px] z-10 bg-[#0a0a1a] font-medium text-slate-200 whitespace-nowrap">{lead.name}</td>
                <td className="text-slate-400">{lead.email}</td>
                <td className="text-slate-400">{lead.phone}</td>
                <td className="text-slate-400 whitespace-nowrap">{lead.handlerName ?? '—'}</td>
                {displayGroups.map((group) => (
                  <React.Fragment key={group.key}>
                    {group.sessions.map((session) => {
                      const rep = reportMap.get(`${lead.id}_${session.id}`);
                      const isDoubt = session.sessionType === 'doubt1' || session.sessionType === 'doubt2';
                      return (
                        <React.Fragment key={session.id}>
                      {/* Reg report — main calls only */}
                      {!isDoubt && (() => {
                        const regVal = rep?.registrationReport ?? '';
                        const regColor = regVal === 'Registered'
                          ? 'text-emerald-400'
                          : regVal === 'Not Registered'
                          ? 'text-red-400'
                          : regVal === 'Not Found'
                          ? 'text-amber-400'
                          : 'text-slate-400';
                        return (
                          <td className="border-l border-white/6 min-w-[130px]">
                            {(user?.role === 'admin' || user?.role === 'backend_manager') ? (
                              <select
                                className={`input-glass py-1 text-xs cursor-pointer ${regColor}`}
                                value={regVal}
                                onChange={(e) => handleReportChange(lead, session, 'registrationReport', e.target.value)}
                              >
                                <option value="">—</option>
                                <option value="Registered" className="text-emerald-400">Registered</option>
                                <option value="Not Registered" className="text-red-400">Not Registered</option>
                                <option value="Not Found" className="text-amber-400">Not Found</option>
                              </select>
                            ) : (
                              <span className={regColor}>{regVal || '—'}</span>
                            )}
                          </td>
                        );
                      })()}
                      {/* Calling assist — main calls only */}
                      {!isDoubt && (() => {
                        const caVal = rep?.callingAssistReport ?? '';
                        const caColor = getCallingAssistColor(caVal);
                        return (
                          <td className="min-w-[160px]">
                            {canCallingAssist ? (
                              <select
                                className={`input-glass py-1 text-xs cursor-pointer ${caColor}`}
                                value={caVal}
                                onChange={(e) => handleReportChange(lead, session, 'callingAssistReport', e.target.value)}
                              >
                                <option value="">—</option>
                                {CALLING_ASSIST_OPTIONS.map((o) => (
                                  <option
                                    key={o}
                                    value={o}
                                    className={isCallingAssistRedFlag(o) ? 'text-red-400' : ''}
                                  >
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={caColor}>{caVal || '—'}</span>
                            )}
                          </td>
                        );
                      })()}
                      {/* Handler */}
                      {(() => {
                        const hVal = rep?.handlerReport ?? '';
                        const hColor = getHandlerStatusColor(hVal);
                        return (
                          <td className={isDoubt ? 'border-l border-white/6 min-w-[150px]' : 'min-w-[150px]'}>
                            {canHandler ? (
                              <select
                                className={`input-glass py-1 text-xs cursor-pointer ${hColor}`}
                                value={hVal}
                                onChange={(e) => handleReportChange(lead, session, 'handlerReport', e.target.value)}
                              >
                                <option value="">—</option>
                                {HANDLER_OPTIONS.map((o) => (
                                  <option
                                    key={o}
                                    value={o}
                                  >
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={hColor}>{hVal || '—'}</span>
                            )}
                          </td>
                        );
                      })()}
                      {/* Custom fields */}
                      {fields.map((f) => (
                        <td key={f.id} className="min-w-[120px]">
                          {(user?.role === 'admin' || user?.role === 'backend_manager') ? (
                            f.type === 'dropdown' ? (
                              <select
                                className="input-glass py-1 text-xs cursor-pointer"
                                value={rep?.customFieldValues?.[f.id] ?? ''}
                                onChange={(e) => handleReportChange(lead, session, f.id, e.target.value)}
                              >
                                <option value="">—</option>
                                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === 'checkbox' ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-white/10 bg-slate-950 text-indigo-400 cursor-pointer"
                                checked={rep?.customFieldValues?.[f.id] === 'true'}
                                onChange={(e) => handleReportChange(lead, session, f.id, e.target.checked ? 'true' : 'false')}
                              />
                            ) : f.type === 'date' ? (
                              <input
                                type="date"
                                className="input-glass py-1 text-xs"
                                value={rep?.customFieldValues?.[f.id] ?? ''}
                                onChange={(e) => handleReportChange(lead, session, f.id, e.target.value)}
                              />
                            ) : (
                              <input
                                type="text"
                                className="input-glass py-1 text-xs"
                                value={rep?.customFieldValues?.[f.id] ?? ''}
                                onChange={(e) => handleReportChange(lead, session, f.id, e.target.value)}
                              />
                            )
                          ) : (
                            <span>{
                              f.type === 'checkbox'
                                ? (rep?.customFieldValues?.[f.id] === 'true' ? '✓' : '—')
                                : (rep?.customFieldValues?.[f.id] || '—')
                            }</span>
                          )}
                        </td>
                      ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Registered but lead not found */}
      {zoomUnmatched.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400" />
              <h4 className="text-sm font-semibold text-amber-400">
                Registered but Lead Not Found
                <span className="ml-1 font-normal text-amber-500/80">({zoomUnmatched.length})</span>
              </h4>
            </div>
            <button
              onClick={() => setZoomUnmatched([])}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
            <table className="table-glass text-xs w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {zoomUnmatched.map((r, i) => (
                  <tr key={i}>
                    <td className="text-slate-500">{i + 1}</td>
                    {editingUnmatchedIdx === i ? (
                      <>
                        <td><input className="input-glass py-1 text-xs w-full" value={editingUnmatchedData.name} onChange={(e) => setEditingUnmatchedData((d) => ({ ...d, name: e.target.value }))} /></td>
                        <td><input className="input-glass py-1 text-xs w-full" value={editingUnmatchedData.email} onChange={(e) => setEditingUnmatchedData((d) => ({ ...d, email: e.target.value }))} /></td>
                        <td><input className="input-glass py-1 text-xs w-full" value={editingUnmatchedData.phone} onChange={(e) => setEditingUnmatchedData((d) => ({ ...d, phone: e.target.value }))} /></td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={handleSaveEditUnmatched} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors" title="Save">✓</button>
                            <button onClick={() => setEditingUnmatchedIdx(null)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors" title="Cancel">✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="font-medium text-slate-200">{r.name || '—'}</td>
                        <td className="text-slate-400">{r.email || '—'}</td>
                        <td className="text-slate-400">{r.phone || '—'}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleAddUnmatchedAsLead(i)} className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Add as Lead">
                              <Plus size={13} />
                            </button>
                            <button onClick={() => handleStartEditUnmatched(i)} className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleRemoveUnmatched(i)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors" title="Remove">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showZoomModal} onClose={() => setShowZoomModal(false)} title="Upload Zoom Registration" size="lg" solid>
        <ZoomRegistrationForm
          callGroups={callGroups}
          leads={leads}
          batchId={batchId}
          reportMap={reportMap}
          onComplete={(unmatched) => {
            setZoomUnmatched(unmatched);
            setShowZoomModal(false);
          }}
          onClose={() => setShowZoomModal(false)}
        />
      </Modal>
    </div>
  );
}

// ─── Assign Tab ───────────────────────────────────────────────────────────────
function AssignTab({ batchId, assignedIds }: { batchId: string; assignedIds: string[] }) {
  const { users, loading } = useUsers('calling_assist');
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(uid: string) {
    setBusy(uid);
    const batchRef = doc(db, 'batches', batchId);
    try {
      if (assignedIds.includes(uid)) {
        await updateDoc(batchRef, { assignedCallingAssistIds: arrayRemove(uid) });
        toast.success('Unassigned');
      } else {
        await updateDoc(batchRef, { assignedCallingAssistIds: arrayUnion(uid) });
        toast.success('Assigned');
      }
    } catch {
      toast.error('Failed to update assignment');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-center text-slate-500 py-8">Loading…</div>;

  if (users.length === 0) {
    return (
      <div className="text-center py-10">
        <UserCheck size={36} className="text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">No calling assist users found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-4">
        Assigned calling assists can see this batch in their <strong className="text-slate-300">Assign Data</strong> page.
        Un-assign to hide it from them once work is done.
      </p>
      {users.map((u) => {
        const assigned = assignedIds.includes(u.uid);
        const isBusy = busy === u.uid;
        return (
          <div
            key={u.uid}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              assigned
                ? 'border-indigo-500/30 bg-indigo-500/8'
                : 'border-white/6 bg-white/2'
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {u.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{u.displayName}</p>
              <p className="text-xs text-slate-500 truncate">{u.email}</p>
            </div>
            <button
              onClick={() => toggle(u.uid)}
              disabled={isBusy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                assigned
                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                  : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 border border-indigo-500/20'
              } disabled:opacity-50`}
            >
              {assigned
                ? <><UserX size={13} /> Unassign</>
                : <><UserCheck size={13} /> Assign</>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Promote Batch Modal ──────────────────────────────────────────────────────
function PromoteBatchModal({
  batchId,
  programId,
  levelId,
  levelName,
  onClose,
}: {
  batchId: string;
  programId: string;
  levelId: string;
  levelName: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { leads } = useLeads(batchId);
  const { levels } = useLevels(programId);
  const [targetLevelId, setTargetLevelId] = useState('');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [targetBatchId, setTargetBatchId] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const { batches: targetBatches } = useBatches(targetLevelId || null);

  const otherLevels = levels.filter((l) => l.id !== levelId);
  const targetLevelName = levels.find((l) => l.id === targetLevelId)?.name ?? '';

  const eligibleLeads = leads.filter((l) =>
    l.tags?.some((t) => t.levelId === levelId && (t.type === 'deposit' || t.type === 'won')),
  );

  async function handleConfirm() {
    if (!targetLevelId) { toast.error('Select a target level'); return; }
    if (mode === 'existing' && !targetBatchId) { toast.error('Select a target batch'); return; }
    if (mode === 'new' && !newBatchNumber.trim()) { toast.error('Enter a batch number'); return; }
    if (eligibleLeads.length === 0) { toast.error('No eligible leads to promote'); return; }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      let resolvedBatchId: string;
      let existingLeadsCount = 0;

      const wb = writeBatch(db);

      if (mode === 'new') {
        const batchRef = doc(collection(db, 'batches'));
        resolvedBatchId = batchRef.id;
        wb.set(batchRef, {
          programId,
          levelId: targetLevelId,
          batchNumber: newBatchNumber.trim(),
          batchName: newBatchName.trim(),
          startDate: '',
          endDate: '',
          remarks: `Promoted from ${levelName}`,
          assignedCallingAssistIds: [],
          createdAt: now,
          updatedAt: now,
          createdBy: user!.uid,
        });
      } else {
        resolvedBatchId = targetBatchId;
        const snap = await getDocs(query(collection(db, 'leads'), where('batchId', '==', resolvedBatchId)));
        existingLeadsCount = snap.size;
      }

      eligibleLeads.forEach((lead, idx) => {
        const ref = doc(collection(db, 'leads'));
        wb.set(ref, {
          batchId: resolvedBatchId,
          programId,
          levelId: targetLevelId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          handlerId: null,
          handlerName: null,
          serialNumber: existingLeadsCount + idx + 1,
          source: 'manual' as const,
          tags: lead.tags ?? [],
          createdAt: now,
          updatedAt: now,
        });
      });

      await wb.commit();
      toast.success(`${eligibleLeads.length} lead${eligibleLeads.length !== 1 ? 's' : ''} promoted to ${targetLevelName}!`);
      onClose();
    } catch (err) {
      toast.error('Failed to promote batch');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Eligible count banner */}
      <div className={`p-4 rounded-xl border ${eligibleLeads.length > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
        <p className={`text-sm font-semibold ${eligibleLeads.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
          {leads.length === 0 ? 'Loading leads…' : `${eligibleLeads.length} lead${eligibleLeads.length !== 1 ? 's' : ''} eligible for promotion`}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          Only leads tagged <span className="text-amber-400">Deposit</span> or <span className="text-emerald-400">Won</span> in <span className="text-slate-300">{levelName}</span> will be copied.
        </p>
      </div>

      {eligibleLeads.length === 0 && leads.length > 0 ? (
        <div className="text-center py-4 flex flex-col items-center gap-3">
          <p className="text-slate-500 text-sm">No eligible leads. Add <strong className="text-amber-400">Deposit</strong> or <strong className="text-emerald-400">Won</strong> tags to leads in the Leads tab first.</p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      ) : otherLevels.length === 0 ? (
        <div className="text-center py-4 flex flex-col items-center gap-3">
          <p className="text-slate-500 text-sm">No other levels in this program. Create another level first.</p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <>
          <Select
            label="Target Level"
            value={targetLevelId}
            onChange={(e) => { setTargetLevelId(e.target.value); setTargetBatchId(''); setMode('existing'); }}
            placeholder="— Select level —"
            options={otherLevels.map((l) => ({ value: l.id, label: l.name }))}
          />

          {targetLevelId && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${mode === 'existing' ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-white/8 bg-white/3 text-slate-400 hover:text-slate-200'}`}
                >
                  Existing Batch
                </button>
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${mode === 'new' ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-white/8 bg-white/3 text-slate-400 hover:text-slate-200'}`}
                >
                  Create New Batch
                </button>
              </div>

              {mode === 'existing' ? (
                <Select
                  label="Target Batch"
                  value={targetBatchId}
                  onChange={(e) => setTargetBatchId(e.target.value)}
                  placeholder={targetBatches.length === 0 ? '— No batches in this level —' : '— Select batch —'}
                  options={targetBatches.map((b) => ({ value: b.id, label: b.batchName ? `${b.batchName} (#${b.batchNumber})` : `Batch ${b.batchNumber}` }))}
                  disabled={targetBatches.length === 0}
                />
              ) : (
                <div className="space-y-3">
                  <Input label="Batch Number" placeholder="e.g. 001" value={newBatchNumber} onChange={(e) => setNewBatchNumber(e.target.value)} />
                  <Input label="Batch Name (optional)" placeholder="e.g. Promoted Batch A" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} />
                </div>
              )}

              {/* Eligible leads list */}
              {eligibleLeads.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                  <p className="px-3 py-2 text-xs font-medium text-slate-400 border-b border-white/8">
                    Will be promoted ({eligibleLeads.length})
                  </p>
                  <div className="divide-y divide-white/5 max-h-[180px] overflow-y-auto">
                    {eligibleLeads.map((l) => (
                      <div key={l.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                        <span className="font-medium text-slate-200 flex-1 truncate">{l.name}</span>
                        <div className="flex gap-1 flex-shrink-0">
                          {l.tags?.filter((t) => t.levelId === levelId).map((t, i) => (
                            <span key={i} className={`px-1.5 py-0.5 rounded-md font-medium text-[10px] ${t.type === 'won' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                              {t.type === 'won' ? 'Won' : 'Deposit'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              className="flex-1"
              onClick={handleConfirm}
              loading={loading}
              disabled={!targetLevelId || (mode === 'existing' && !targetBatchId) || (mode === 'new' && !newBatchNumber.trim()) || eligibleLeads.length === 0}
            >
              <ChevronsUp size={14} /> Promote {eligibleLeads.length > 0 ? `${eligibleLeads.length} Lead${eligibleLeads.length !== 1 ? 's' : ''}` : 'Batch'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Promote / Demote Lead Modal ──────────────────────────────────────────────
function PromoteLeadModal({
  lead,
  programId,
  currentLevelId,
  onClose,
}: {
  lead: Lead;
  programId: string;
  currentLevelId: string;
  onClose: () => void;
}) {
  const { levels } = useLevels(programId);
  const [targetLevelId, setTargetLevelId] = useState('');
  const [targetBatchId, setTargetBatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const { batches: targetBatches } = useBatches(targetLevelId || null);

  const otherLevels = levels.filter((l) => l.id !== currentLevelId);
  const currentLevel = levels.find((l) => l.id === currentLevelId);
  const targetLevel = levels.find((l) => l.id === targetLevelId);

  // Determine if promoting (higher order) or demoting (lower order)
  const direction = targetLevel
    ? targetLevel.order > (currentLevel?.order ?? 0) ? 'promote' : 'demote'
    : null;

  async function handleConfirm() {
    if (!targetLevelId || !targetBatchId) { toast.error('Select a target level and batch'); return; }
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'leads'), where('batchId', '==', targetBatchId)));
      const existingCount = snap.size;

      const wb = writeBatch(db);
      const ref = doc(collection(db, 'leads'));
      wb.set(ref, {
        batchId: targetBatchId,
        programId,
        levelId: targetLevelId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        handlerId: null,
        handlerName: null,
        serialNumber: existingCount + 1,
        source: 'manual' as const,
        tags: lead.tags ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await wb.commit();

      const targetBatch = targetBatches.find((b) => b.id === targetBatchId);
      const targetBatchLabel = targetBatch?.batchName || `Batch ${targetBatch?.batchNumber}`;
      toast.success(`${lead.name} ${direction === 'demote' ? 'demoted' : 'promoted'} to ${targetLevel?.name} → ${targetBatchLabel}`);
      onClose();
    } catch (err) {
      toast.error('Failed to move lead');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Lead info card */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {lead.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{lead.name}</p>
          <p className="text-xs text-slate-500 truncate">{lead.email || lead.phone}</p>
        </div>
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {lead.tags.map((t, i) => (
              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${t.type === 'won' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {t.type === 'won' ? 'Won' : 'Deposit'}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        The lead will be <span className="text-slate-300">copied</span> to the selected level and batch. The original record remains unchanged.
      </p>

      {otherLevels.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-slate-500 text-sm">No other levels in this program.</p>
        </div>
      ) : (
        <>
          <Select
            label="Target Level"
            value={targetLevelId}
            onChange={(e) => { setTargetLevelId(e.target.value); setTargetBatchId(''); }}
            placeholder="— Select level —"
            options={otherLevels.map((l) => ({ value: l.id, label: l.name }))}
          />

          {targetLevelId && (
            <Select
              label="Target Batch"
              value={targetBatchId}
              onChange={(e) => setTargetBatchId(e.target.value)}
              placeholder={targetBatches.length === 0 ? '— No batches in this level —' : '— Select batch —'}
              options={targetBatches.map((b) => ({ value: b.id, label: b.batchName ? `${b.batchName} (#${b.batchNumber})` : `Batch ${b.batchNumber}` }))}
              disabled={targetBatches.length === 0}
            />
          )}
        </>
      )}

      <div className="flex gap-3 pt-1">
        <Button
          className="flex-1"
          onClick={handleConfirm}
          loading={loading}
          disabled={!targetLevelId || !targetBatchId}
        >
          <ChevronsUp size={14} className={direction === 'demote' ? 'rotate-180' : ''} />
          {direction === 'demote' ? 'Demote Lead' : 'Promote Lead'}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
// ─── Main Batch Page ─────────────────────────────────────────────────────────
export default function BatchDetailPage() {
  const { programId, levelId, batchId } = useParams<{ programId: string; levelId: string; batchId: string }>();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [tab, setTab] = useState<Tab>('calls');

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'programs', programId)),
      getDoc(doc(db, 'levels', levelId)),
    ]).then(([pSnap, lSnap]) => {
      if (pSnap.exists()) setProgram({ id: pSnap.id, ...pSnap.data() } as Program);
      if (lSnap.exists()) setLevel({ id: lSnap.id, ...lSnap.data() } as Level);
    });
  }, [programId, levelId, batchId]);

  // Live-subscribe to batch doc so assignment changes reflect immediately
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'batches', batchId), (snap) => {
      if (snap.exists()) setBatch({ id: snap.id, ...snap.data() } as Batch);
    });
    return unsub;
  }, [batchId]);

  const { user: authUser } = useAuth();
  const canAssign = authUser?.role === 'admin' || authUser?.role === 'backend_manager' || authUser?.role === 'backend_assist';
  const canPromoteBatch = authUser?.role === 'admin' || authUser?.role === 'backend_manager';
  const [showPromoteBatch, setShowPromoteBatch] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'calls', label: 'Calls' },
    { key: 'leads', label: 'Leads' },
    { key: 'fields', label: 'Custom Fields' },
    { key: 'report', label: 'Full Report' },
    ...(canAssign ? [{ key: 'assign' as Tab, label: 'Assign' }] : []),
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6 flex-wrap">
        <Link href="/dashboard/master/programs" className="hover:text-slate-300 transition-colors flex items-center gap-1">
          <ChevronLeft size={14} /> Programs
        </Link>
        <span>/</span>
        <Link href={`/dashboard/master/programs/${programId}`} className="hover:text-slate-300 transition-colors">
          {program?.name ?? '…'}
        </Link>
        <span>/</span>
        <Link href={`/dashboard/master/programs/${programId}/levels/${levelId}`} className="hover:text-slate-300 transition-colors">
          {level?.name ?? '…'}
        </Link>
        <span>/</span>
        <span className="text-slate-300">Batch {batch?.batchNumber ?? '…'}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text mb-1">
            {batch?.batchName || `Batch ${batch?.batchNumber ?? ''}`}
          </h1>
          <p className="text-slate-500 text-sm">
            {program?.name} → {level?.name}
          </p>
        </div>
        {canPromoteBatch && batch && (
          <Button size="sm" variant="secondary" onClick={() => setShowPromoteBatch(true)}>
            <ChevronsUp size={14} /> Promote Batch
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/8 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              tab === t.key
                ? 'text-indigo-400 border-b-2 border-indigo-400 -mb-px'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="glass-card p-5">
        {tab === 'leads' && <LeadsTab batchId={batchId} programId={programId} levelId={levelId} levelName={level?.name ?? ''} />}
        {tab === 'calls' && <CallsTab batchId={batchId} programId={programId} levelId={levelId} />}
        {tab === 'fields' && <FieldsTab batchId={batchId} />}
        {tab === 'report' && <ReportTab batchId={batchId} programId={programId} levelId={levelId} />}
        {tab === 'assign' && <AssignTab batchId={batchId} assignedIds={batch?.assignedCallingAssistIds ?? []} />}
      </div>

      {/* Promote Batch Modal */}
      <Modal open={showPromoteBatch} onClose={() => setShowPromoteBatch(false)} title="Promote Batch to Another Level" size="md" solid>
        <PromoteBatchModal
          batchId={batchId}
          programId={programId}
          levelId={levelId}
          levelName={level?.name ?? ''}
          onClose={() => setShowPromoteBatch(false)}
        />
      </Modal>
    </div>
  );
}
