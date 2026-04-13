'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Plus, Upload, Phone, Users, Settings2, Trash2, Pencil,
  ChevronLeft, RefreshCw, Download, ChevronRight,
} from 'lucide-react';
import { doc, getDoc, collection, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Papa from 'papaparse';
import { useLeads } from '@/hooks/useLeads';
import { useCallSessions } from '@/hooks/useCallSessions';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useCallReports } from '@/hooks/useCallReports';
import { useUsers } from '@/hooks/useUsers';
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
} from '@/lib/utils';
import { CALLING_ASSIST_OPTIONS, HANDLER_OPTIONS } from '@/types';
import type {
  Program, Level, Batch, CallSession, CallSessionType, CustomField, Lead, LeadCallReport, CustomFieldType,
} from '@/types';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'leads' | 'calls' | 'fields' | 'report';

type CallGroup = {
  key: string;
  name: string;
  date: string;
  order: number;
  sessions: CallSession[];
};

const CALL_SESSION_TYPE_OPTIONS: Array<{ value: CallSessionType; label: string }> = [
  { value: 'main', label: 'Main Call' },
  { value: 'doubt1', label: 'Doubt Call 1' },
  { value: 'doubt2', label: 'Doubt Call 2' },
];

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
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const callGroups = groupCallSessions(calls);

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

  async function handleDelete(group: CallGroup) {
    if (!confirm('Delete this call and all of its sub-sessions?')) return;

    const write = writeBatch(db);
    group.sessions.forEach((session) => {
      write.delete(doc(db, 'callSessions', session.id));
    });

    await write.commit();
    toast.success('Deleted');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-200">Calls</h3>
        {(user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist') && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Call
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : callGroups.length === 0 ? (
        <div className="text-center py-10">
          <Phone size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No calls configured yet</p>
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
                {(user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist') && (
                  <button onClick={() => handleDelete(group)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Call">
        <CallForm onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
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
  const [name, setName] = useState('');
  const [sessionTypes, setSessionTypes] = useState<Record<CallSessionType, boolean>>({
    main: true,
    doubt1: false,
    doubt2: false,
  });
  const [loading, setLoading] = useState(false);

  function toggleSessionType(sessionType: CallSessionType) {
    setSessionTypes((current) => ({
      ...current,
      [sessionType]: !current[sessionType],
    }));
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !name.trim()) return;
    const selectedSessionTypes = CALL_SESSION_TYPE_OPTIONS
      .filter((option) => sessionTypes[option.value])
      .map((option) => option.value);

    if (selectedSessionTypes.length === 0) {
      toast.error('Select at least one sub-session');
      return;
    }

    setLoading(true);
    try { await onSave(date, name.trim(), selectedSessionTypes); onClose(); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label="Call Name" placeholder="e.g. Call 1st, 3Day - 1" value={name} onChange={(e) => setName(e.target.value)} required />
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
  batchId, programId, levelId,
}: { batchId: string; programId: string; levelId: string }) {
  const { leads, loading } = useLeads(batchId);
  const { users: assistants } = useUsers('backend_assist');
  const { user } = useAuth();
  const [showImport, setShowImport] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
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

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist';

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
                  <td className="font-medium text-slate-200">{lead.name}</td>
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

// ─── Report Table ─────────────────────────────────────────────────────────────
function ReportTab({ batchId }: { batchId: string }) {
  const { leads } = useLeads(batchId);
  const { calls } = useCallSessions(batchId);
  const { fields } = useCustomFields(batchId);
  const { reportMap } = useCallReports(batchId);
  const { user } = useAuth();
  const [selectedCallGroup, setSelectedCallGroup] = useState<string>('all');
  const callGroups = groupCallSessions(calls);

  useEffect(() => {
    if (selectedCallGroup !== 'all' && !callGroups.some((group) => group.key === selectedCallGroup)) {
      setSelectedCallGroup('all');
    }
  }, [callGroups, selectedCallGroup]);

  const displayGroups = selectedCallGroup === 'all'
    ? callGroups
    : callGroups.filter((group) => group.key === selectedCallGroup);

  async function handleReportChange(
    lead: Lead,
    call: CallSession,
    field: keyof LeadCallReport | string,
    value: string,
  ) {
    const key = `${lead.id}_${call.id}`;
    const existing = reportMap.get(key);
    const patch: Partial<LeadCallReport> =
      field === 'registrationReport' || field === 'callingAssistReport' || field === 'handlerReport'
        ? { [field]: value || null }
        : { customFieldValues: { ...(existing?.customFieldValues ?? {}), [field]: value } };
    await upsertReport(existing, batchId, lead.id, call.id, patch);
  }

  if (leads.length === 0) return <p className="text-slate-500 text-sm">Add leads first to see the report table.</p>;
  if (calls.length === 0) return <p className="text-slate-500 text-sm">Add call sessions first.</p>;

  const canCallingAssist = user?.role === 'calling_assist' || user?.role === 'admin' || user?.role === 'backend_manager';
  const canHandler = user?.role === 'backend_assist' || user?.role === 'admin' || user?.role === 'backend_manager';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h3 className="font-semibold text-slate-200">Report Table</h3>
        <Select
          value={selectedCallGroup}
          onChange={(e) => setSelectedCallGroup(e.target.value)}
          options={[
            { value: 'all', label: 'All Calls' },
            ...callGroups.map((group) => ({ value: group.key, label: `${formatDate(group.date)} — ${group.name}` })),
          ]}
          className="ml-auto text-xs"
        />
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
                <th key={`${group.key}_name`} colSpan={group.sessions.length * (3 + fields.length)} className="text-center border-l border-white/10">
                  {group.name}
                </th>
              ))}
            </tr>
            <tr>
              {displayGroups.map((group) => (
                <th key={`${group.key}_date`} colSpan={group.sessions.length * (3 + fields.length)} className="text-center border-l border-white/10 text-slate-400">
                  {formatDate(group.date)}
                </th>
              ))}
            </tr>
            <tr>
              {displayGroups.map((group) => (
                <React.Fragment key={`${group.key}_sessions`}>
                  {group.sessions.map((session) => (
                    <th key={`${session.id}_session`} colSpan={3 + fields.length} className="border-l border-white/10 text-center text-indigo-300/80">
                      {getCallSessionTypeLabel(session.sessionType)}
                    </th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
            <tr>
              {displayGroups.map((group) => (
                <React.Fragment key={`${group.key}_fields`}>
                  {group.sessions.map((session) => (
                    <React.Fragment key={`${session.id}_columns`}>
                      <th className="border-l border-white/10 text-indigo-300/80">Reg. Report</th>
                      <th className="text-cyan-300/80">Calling Report</th>
                      <th className="text-purple-300/80">Handler Report</th>
                      {fields.map((field) => (
                        <th key={`${session.id}_${field.id}`} className="text-amber-300/80">{field.label}</th>
                      ))}
                    </React.Fragment>
                  ))}
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
                      return (
                        <React.Fragment key={session.id}>
                      {/* Reg report */}
                      <td className="border-l border-white/6 min-w-[120px]">
                        {(user?.role === 'admin' || user?.role === 'backend_manager') ? (
                          <input
                            className="input-glass py-1 text-xs"
                            value={rep?.registrationReport ?? ''}
                            onChange={(e) => handleReportChange(lead, session, 'registrationReport', e.target.value)}
                          />
                        ) : <span>{rep?.registrationReport || '—'}</span>}
                      </td>
                      {/* Calling assist */}
                      <td className="min-w-[140px]">
                        {canCallingAssist ? (
                          <select
                            className="input-glass py-1 text-xs cursor-pointer"
                            value={rep?.callingAssistReport ?? ''}
                            onChange={(e) => handleReportChange(lead, session, 'callingAssistReport', e.target.value)}
                          >
                            <option value="">—</option>
                            {CALLING_ASSIST_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : <span>{rep?.callingAssistReport || '—'}</span>}
                      </td>
                      {/* Handler */}
                      <td className="min-w-[140px]">
                        {canHandler ? (
                          <select
                            className="input-glass py-1 text-xs cursor-pointer"
                            value={rep?.handlerReport ?? ''}
                            onChange={(e) => handleReportChange(lead, session, 'handlerReport', e.target.value)}
                          >
                            <option value="">—</option>
                            {HANDLER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : <span>{rep?.handlerReport || '—'}</span>}
                      </td>
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
                            ) : (
                              <input
                                className="input-glass py-1 text-xs"
                                value={rep?.customFieldValues?.[f.id] ?? ''}
                                onChange={(e) => handleReportChange(lead, session, f.id, e.target.value)}
                              />
                            )
                          ) : (
                            <span>{rep?.customFieldValues?.[f.id] || '—'}</span>
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
      getDoc(doc(db, 'batches', batchId)),
    ]).then(([pSnap, lSnap, bSnap]) => {
      if (pSnap.exists()) setProgram({ id: pSnap.id, ...pSnap.data() } as Program);
      if (lSnap.exists()) setLevel({ id: lSnap.id, ...lSnap.data() } as Level);
      if (bSnap.exists()) setBatch({ id: bSnap.id, ...bSnap.data() } as Batch);
    });
  }, [programId, levelId, batchId]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'calls', label: 'Calls' },
    { key: 'leads', label: 'Leads' },
    { key: 'fields', label: 'Custom Fields' },
    { key: 'report', label: 'Full Report' },
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

      <h1 className="text-2xl font-bold gradient-text mb-1">
        {batch?.batchName || `Batch ${batch?.batchNumber ?? ''}`}
      </h1>
      <p className="text-slate-500 text-sm mb-6">
        {program?.name} → {level?.name}
      </p>

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
        {tab === 'leads' && <LeadsTab batchId={batchId} programId={programId} levelId={levelId} />}
        {tab === 'calls' && <CallsTab batchId={batchId} programId={programId} levelId={levelId} />}
        {tab === 'fields' && <FieldsTab batchId={batchId} />}
        {tab === 'report' && <ReportTab batchId={batchId} />}
      </div>
    </div>
  );
}
