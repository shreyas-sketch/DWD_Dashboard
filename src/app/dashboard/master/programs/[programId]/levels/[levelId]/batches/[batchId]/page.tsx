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
import { distributeLeads, formatDate } from '@/lib/utils';
import { CALLING_ASSIST_OPTIONS, HANDLER_OPTIONS } from '@/types';
import type {
  Program, Level, Batch, CallSession, CustomField, Lead, LeadCallReport, CustomFieldType,
} from '@/types';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'leads' | 'calls' | 'fields' | 'report';

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
  const [editing, setEditing] = useState<CallSession | null>(null);

  async function handleCreate(date: string, name: string) {
    const sameDayCalls = calls.filter((c) => c.date === date);
    await createDocument<Omit<CallSession, 'id'>>('callSessions', {
      batchId, programId, levelId,
      date, name,
      order: sameDayCalls.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user!.uid,
    });
    toast.success('Call session added!');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this call session?')) return;
    await deleteDocument('callSessions', id);
    toast.success('Deleted');
  }

  const groupedByDate = calls.reduce<Record<string, CallSession[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = [];
    acc[c.date].push(c);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-200">Call Sessions</h3>
        {(user?.role === 'admin' || user?.role === 'backend_manager') && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Call
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : calls.length === 0 ? (
        <div className="text-center py-10">
          <Phone size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No call sessions yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dateCalls]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {formatDate(date)}
                </p>
                <div className="space-y-2">
                  {dateCalls.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/6">
                      <Phone size={14} className="text-indigo-400 flex-shrink-0" />
                      <span className="flex-1 text-sm text-slate-200">{c.name}</span>
                      {(user?.role === 'admin' || user?.role === 'backend_manager') && (
                        <button onClick={() => handleDelete(c.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Call Session">
        <CallForm onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
  );
}

function CallForm({ onSave, onClose }: { onSave: (date: string, name: string) => Promise<void>; onClose: () => void }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !name.trim()) return;
    setLoading(true);
    try { await onSave(date, name.trim()); onClose(); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label="Call Name" placeholder="e.g. 1st Day Call, Doubt Session" value={name} onChange={(e) => setName(e.target.value)} required />
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

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager';

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
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function handleCSV(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const batch = writeBatch(db);
        rows.forEach((row, idx) => {
          const name = row['name'] || row['Name'] || '';
          const email = row['email'] || row['Email'] || '';
          const phone = row['phone'] || row['Phone'] || row['phone_number'] || '';
          if (!name && !email && !phone) return;
          const ref = doc(collection(db, 'leads'));
          batch.set(ref, {
            batchId, programId, levelId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            handlerId: null,
            handlerName: null,
            serialNumber: leads.length + idx + 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'import',
          });
        });
        await batch.commit();
        toast.success(`Imported ${rows.length} leads!`);
        setShowImport(false);
      },
      error: () => toast.error('CSV parse error'),
    });
  }

  async function handleAddSingle(name: string, email: string, phone: string) {
    await createDocument<Omit<Lead, 'id'>>('leads', {
      batchId, programId, levelId,
      name, email: email.toLowerCase(), phone,
      handlerId: null, handlerName: null,
      serialNumber: leads.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'manual',
    });
    toast.success('Lead added!');
  }

  async function handleDeleteLead(id: string) {
    if (!confirm('Delete this lead?')) return;
    await deleteDocument('leads', id);
    toast.success('Lead deleted');
  }

  async function handleEditLead(name: string, email: string, phone: string) {
    if (!editingLead) return;
    await updateDocument('leads', editingLead.id, { name, email: email.toLowerCase(), phone });
    toast.success('Lead updated');
    setEditingLead(null);
  }

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager';

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-slate-200">
          Leads <span className="text-slate-500 font-normal">({leads.length})</span>
        </h3>
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
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
                <tr key={lead.id}>
                  <td className="text-slate-500">{lead.serialNumber}</td>
                  <td className="font-medium text-slate-200">{lead.name}</td>
                  <td className="text-slate-400">{lead.email}</td>
                  <td className="text-slate-400">{lead.phone}</td>
                  <td>
                    {lead.handlerName ? (
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

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Add Leads" size="md">
        <LeadImportForm
          onCSV={handleCSV}
          onManual={handleAddSingle}
          onClose={() => setShowImport(false)}
        />
      </Modal>

      <Modal open={!!editingLead} onClose={() => setEditingLead(null)} title="Edit Lead">
        {editingLead && (
          <LeadEditForm
            initial={editingLead}
            onSave={handleEditLead}
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
  onClose,
}: {
  initial: Lead;
  onSave: (name: string, email: string, phone: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try { await onSave(name.trim(), email.trim(), phone.trim()); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Save Changes</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function LeadImportForm({
  onCSV, onManual, onClose,
}: {
  onCSV: (file: File) => Promise<void>;
  onManual: (name: string, email: string, phone: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleManual(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try { await onManual(name.trim(), email.trim(), phone.trim()); onClose(); }
    finally { setLoading(false); }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try { await onCSV(file); }
    finally { setLoading(false); }
  }

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
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading} className="flex-1">Add Lead</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm text-slate-400">
            CSV must have columns: <code className="text-indigo-300">name</code>, <code className="text-indigo-300">email</code>, <code className="text-indigo-300">phone</code>
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
  const [selectedCall, setSelectedCall] = useState<string>('all');

  const displayCalls = selectedCall === 'all' ? calls : calls.filter((c) => c.id === selectedCall);

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
          value={selectedCall}
          onChange={(e) => setSelectedCall(e.target.value)}
          options={[
            { value: 'all', label: 'All Calls' },
            ...calls.map((c) => ({ value: c.id, label: `${formatDate(c.date)} — ${c.name}` })),
          ]}
          className="ml-auto text-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="table-glass text-xs min-w-max">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-950">Sr.</th>
              <th className="sticky left-[50px] z-10 bg-slate-950">Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Handler</th>
              {displayCalls.map((c) => (
                <React.Fragment key={c.id}>
                  <th colSpan={3 + fields.length} className="text-center border-l border-white/10">
                    {formatDate(c.date)} — {c.name}
                  </th>
                </React.Fragment>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-950"></th>
              <th className="sticky left-[50px] z-10 bg-slate-950"></th>
              <th></th>
              <th></th>
              <th></th>
              {displayCalls.map((c) => (
                <React.Fragment key={c.id}>
                  <th className="border-l border-white/10 text-indigo-300/80">Reg. Report</th>
                  <th className="text-cyan-300/80">Calling Report</th>
                  <th className="text-purple-300/80">Handler Report</th>
                  {fields.map((f) => (
                    <th key={f.id} className="text-amber-300/80">{f.label}</th>
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
                {displayCalls.map((c) => {
                  const rep = reportMap.get(`${lead.id}_${c.id}`);
                  return (
                    <React.Fragment key={c.id}>
                      {/* Reg report */}
                      <td className="border-l border-white/6 min-w-[120px]">
                        {(user?.role === 'admin' || user?.role === 'backend_manager') ? (
                          <input
                            className="input-glass py-1 text-xs"
                            value={rep?.registrationReport ?? ''}
                            onChange={(e) => handleReportChange(lead, c, 'registrationReport', e.target.value)}
                          />
                        ) : <span>{rep?.registrationReport || '—'}</span>}
                      </td>
                      {/* Calling assist */}
                      <td className="min-w-[140px]">
                        {canCallingAssist ? (
                          <select
                            className="input-glass py-1 text-xs cursor-pointer"
                            value={rep?.callingAssistReport ?? ''}
                            onChange={(e) => handleReportChange(lead, c, 'callingAssistReport', e.target.value)}
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
                            onChange={(e) => handleReportChange(lead, c, 'handlerReport', e.target.value)}
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
                                onChange={(e) => handleReportChange(lead, c, f.id, e.target.value)}
                              >
                                <option value="">—</option>
                                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                className="input-glass py-1 text-xs"
                                value={rep?.customFieldValues?.[f.id] ?? ''}
                                onChange={(e) => handleReportChange(lead, c, f.id, e.target.value)}
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
  const [tab, setTab] = useState<Tab>('leads');

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
    { key: 'leads', label: 'Leads' },
    { key: 'calls', label: 'Call Sessions' },
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
