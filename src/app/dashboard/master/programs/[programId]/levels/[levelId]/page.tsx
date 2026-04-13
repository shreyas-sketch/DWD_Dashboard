'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Package, Pencil, Trash2, ChevronRight, ChevronLeft, Calendar, ClipboardList, GripVertical, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useBatches } from '@/hooks/useBatches';
import { useCallTemplates } from '@/hooks/useCallTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { createDocument, updateDocument, deleteDocument } from '@/lib/firestore';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { Program, Level, Batch, CallTemplate, CallTemplateEntry, CallSessionType } from '@/types';

// ─── Call Session Type options (same presets as batch page) ───────────────────
const CALL_SESSION_TYPE_OPTIONS: Array<{ value: CallSessionType; label: string }> = [
  { value: 'main', label: 'Main Call' },
  { value: 'doubt1', label: 'Doubt Call 1' },
  { value: 'doubt2', label: 'Doubt Call 2' },
];

const CALL_NAME_PRESETS = [
  'L0 - Day 1 Workshop',
  'L0 - Day 2 Workshop',
  'L1 - Day 1',
  'L1 - Day 2',
  'Event Day 1',
  'Event Day 2',
  'Event Day 3',
  'Event Day 4',
];

// ─── Template Form ────────────────────────────────────────────────────────────
function TemplateForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: CallTemplate;
  onSave: (templateName: string, entries: CallTemplateEntry[]) => Promise<void>;
  onClose: () => void;
}) {
  const [templateName, setTemplateName] = useState(initial?.templateName ?? '');
  const [entries, setEntries] = useState<CallTemplateEntry[]>(
    initial?.entries ?? [{ name: '', sessionTypes: ['main'] }],
  );
  const [loading, setLoading] = useState(false);

  function addEntry() {
    setEntries((prev) => [...prev, { name: '', sessionTypes: ['main'] }]);
  }

  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setEntryName(i: number, name: string) {
    setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, name } : e));
  }

  function toggleEntrySessionType(i: number, st: CallSessionType) {
    setEntries((prev) => prev.map((e, idx) => {
      if (idx !== i) return e;
      const has = e.sessionTypes.includes(st);
      return { ...e, sessionTypes: has ? e.sessionTypes.filter((s) => s !== st) : [...e.sessionTypes, st] };
    }));
  }

  function setPreset(i: number, name: string) {
    setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, name } : e));
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!templateName.trim()) return;
    const validEntries = entries.filter((en) => en.name.trim() && en.sessionTypes.length > 0);
    if (validEntries.length === 0) { toast.error('Add at least one call entry'); return; }
    setLoading(true);
    try {
      await onSave(templateName.trim(), validEntries);
      onClose();
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      <Input
        label="Template Name"
        placeholder="e.g. Standard L0 Schedule"
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
        required
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-300">Call Entries</p>
          <Button type="button" size="sm" variant="secondary" onClick={addEntry}>
            <Plus size={13} /> Add Call
          </Button>
        </div>
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="text-slate-600 flex-shrink-0" />
                <span className="text-xs text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                <div className="flex-1">
                  {/* Name input with preset chips */}
                  <input
                    className="input-glass text-sm"
                    placeholder="Call name…"
                    value={entry.name}
                    onChange={(ev) => setEntryName(i, ev.target.value)}
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded-lg flex-shrink-0"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5 pl-7">
                {CALL_NAME_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(i, p)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                      entry.name === p
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {/* Session type checkboxes */}
              <div className="flex gap-3 pl-7">
                {CALL_SESSION_TYPE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={entry.sessionTypes.includes(opt.value)}
                      onChange={() => toggleEntrySessionType(i, opt.value)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">
          {initial ? 'Update Template' : 'Save Template'}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function BatchForm({
  initial,
  existingBatches,
  onSave,
  onClose,
}: {
  initial?: Partial<Batch>;
  existingBatches: Batch[];
  onSave: (data: Omit<Batch, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'programId' | 'levelId'>) => Promise<void>;
  onClose: () => void;
}) {
  // ── Auto-compute next batch number ──────────────────────────────────────────
  function computeNextNumber(batches: Batch[], excludeId?: string): string {
    const nums = batches
      .filter((b) => !excludeId || b.id !== excludeId)
      .map((b) => parseInt(b.batchNumber, 10))
      .filter((n) => !isNaN(n));
    if (nums.length === 0) return '1';
    return String(Math.max(...nums) + 1);
  }

  const [batchNumber, setBatchNumber] = useState(
    initial?.batchNumber ?? computeNextNumber(existingBatches, initial?.id),
  );
  const [batchName, setBatchName] = useState(initial?.batchName ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate?.slice(0, 7) ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate?.slice(0, 7) ?? '');
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [loading, setLoading] = useState(false);

  // Numbers already in use (excluding the current batch being edited)
  const takenNumbers = existingBatches
    .filter((b) => b.id !== initial?.id)
    .map((b) => b.batchNumber.trim());

  const isTaken = takenNumbers.includes(batchNumber.trim());

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!batchNumber.trim()) return;
    setLoading(true);
    try {
      await onSave({ batchNumber: batchNumber.trim(), batchName: batchName.trim(), startDate, endDate, remarks: remarks.trim() });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      {/* Taken batch numbers hint */}
      {takenNumbers.length > 0 && (
        <div className="rounded-xl bg-white/3 border border-white/8 px-3 py-2">
          <p className="text-xs text-slate-500 mb-1.5">Existing batch numbers:</p>
          <div className="flex flex-wrap gap-1.5">
            {takenNumbers.map((n) => (
              <span
                key={n}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  n === batchNumber.trim()
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-slate-700/50 text-slate-400'
                }`}
              >
                #{n} {n === batchNumber.trim() ? '✗ taken' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Input
            label="Batch Number"
            placeholder="e.g. 5"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            required
          />
          {isTaken && (
            <p className="text-xs text-red-400 mt-1">This batch number is already taken</p>
          )}
        </div>
        <Input label="Batch Name" placeholder="Jan 2025 Batch" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start Month" type="month" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input label="End Month" type="month" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <Input label="Remarks" placeholder="Optional notes…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} disabled={isTaken} className="flex-1">{initial?.id ? 'Update' : 'Create'} Batch</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

export default function LevelDetailPage() {
  const { programId, levelId } = useParams<{ programId: string; levelId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { batches, loading } = useBatches(levelId);
  const { templates, loading: templatesLoading } = useCallTemplates(levelId);
  const [program, setProgram] = useState<Program | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [activeTab, setActiveTab] = useState<'batches' | 'templates'>('batches');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  // Template state
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CallTemplate | null>(null);

  const canManageTemplates = user?.role === 'admin' || user?.role === 'backend_manager';

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'programs', programId)),
      getDoc(doc(db, 'levels', levelId)),
    ]).then(([pSnap, lSnap]) => {
      if (pSnap.exists()) setProgram({ id: pSnap.id, ...pSnap.data() } as Program);
      if (lSnap.exists()) setLevel({ id: lSnap.id, ...lSnap.data() } as Level);
    });
  }, [programId, levelId]);

  // ── Template CRUD ──────────────────────────────────────────────────────────
  async function handleCreateTemplate(templateName: string, entries: CallTemplateEntry[]) {
    await createDocument<Omit<CallTemplate, 'id'>>('callTemplates', {
      levelId,
      programId,
      templateName,
      entries,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user!.uid,
    });
    toast.success('Template saved!');
  }

  async function handleUpdateTemplate(templateName: string, entries: CallTemplateEntry[]) {
    if (!editingTemplate) return;
    await updateDocument('callTemplates', editingTemplate.id, { templateName, entries });
    toast.success('Template updated!');
    setEditingTemplate(null);
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this call template?')) return;
    await deleteDocument('callTemplates', id);
    toast.success('Template deleted');
  }

  function hasDuplicateBatchNumber(batchNumber: string, excludeId?: string) {
    const normalized = batchNumber.trim().toLowerCase();
    return batches.some((b) => b.id !== excludeId && b.batchNumber.trim().toLowerCase() === normalized);
  }

  type BatchFormData = Omit<Batch, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'programId' | 'levelId'>;

  async function handleCreate(data: BatchFormData) {
    if (hasDuplicateBatchNumber(data.batchNumber)) {
      toast.error('Batch number must be unique in this level');
      return;
    }
    const newId = await createDocument<Omit<Batch, 'id'>>('batches', {
      ...data,
      programId,
      levelId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user!.uid,
    });
    toast.success('Batch created! Add calls now.');
    router.push(`/dashboard/master/programs/${programId}/levels/${levelId}/batches/${newId}`);
  }

  async function handleUpdate(data: BatchFormData) {
    if (hasDuplicateBatchNumber(data.batchNumber, editing!.id)) {
      toast.error('Batch number must be unique in this level');
      return;
    }
    await updateDocument('batches', editing!.id, data);
    toast.success('Batch updated!');
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this batch? All leads and reports will be removed.')) return;
    await deleteDocument('batches', id);
    toast.success('Batch deleted');
  }

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist';

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
        <span className="text-slate-300">{level?.name ?? '…'}</span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{level?.name ?? 'Level'}</h1>
          <p className="text-slate-500 text-sm mt-1">{program?.name}</p>
        </div>
        {activeTab === 'batches' && canEdit && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Batch
          </Button>
        )}
        {activeTab === 'templates' && canManageTemplates && (
          <Button onClick={() => setShowAddTemplate(true)}>
            <Plus size={16} /> Add Template
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-white/8">
        <button
          onClick={() => setActiveTab('batches')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
            activeTab === 'batches'
              ? 'text-indigo-400 border-b-2 border-indigo-400 -mb-px'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Package size={14} /> Batches
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
            activeTab === 'templates'
              ? 'text-indigo-400 border-b-2 border-indigo-400 -mb-px'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ClipboardList size={14} /> Call Templates
          {templates.length > 0 && (
            <span className="ml-1 text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Batches Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'batches' && (
        <>
          {loading ? (
            <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
          ) : batches.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Package size={40} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No batches yet</p>
              <p className="text-slate-600 text-sm mt-1">Create a batch to start adding leads</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {batches.map((b) => (
                <div key={b.id} className="glass-card p-5 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 text-xs font-bold flex-shrink-0">
                      #{b.batchNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 truncate">{b.batchName || `Batch ${b.batchNumber}`}</p>
                      {(b.startDate || b.endDate) && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Calendar size={11} />
                          {b.startDate && <span>{b.startDate.slice(0, 7)}</span>}
                          {b.startDate && b.endDate && <span>→</span>}
                          {b.endDate && <span>{b.endDate.slice(0, 7)}</span>}
                        </div>
                      )}
                      {b.remarks && <p className="text-xs text-slate-500 mt-0.5">{b.remarks}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/6">
                    <Link
                      href={`/dashboard/master/programs/${programId}/levels/${levelId}/batches/${b.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors py-1"
                    >
                      Manage Batch <ChevronRight size={14} />
                    </Link>
                    {canEdit && (
                      <>
                        <button onClick={() => setEditing(b)} className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(b.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Templates Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <>
          {templatesLoading ? (
            <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <ClipboardList size={40} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No call templates yet</p>
              {canManageTemplates && (
                <p className="text-slate-600 text-sm mt-1">Create a template to quickly add calls to new batches</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map((t) => (
                <div key={t.id} className="glass-card p-5 flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 flex-shrink-0">
                      <ClipboardList size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 truncate">{t.templateName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t.entries.length} call{t.entries.length !== 1 ? 's' : ''}</p>
                    </div>
                    {canManageTemplates && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setEditingTemplate(t)} className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Entry list preview */}
                  <div className="space-y-1.5">
                    {t.entries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/3 border border-white/6">
                        <span className="text-slate-500 w-4 flex-shrink-0">{i + 1}.</span>
                        <span className="text-slate-300 flex-1 truncate">{entry.name}</span>
                        <div className="flex gap-1">
                          {entry.sessionTypes.map((st) => (
                            <span key={st} className="px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px]">
                              {st === 'main' ? 'Main' : st === 'doubt1' ? 'D1' : 'D2'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Batch" size="md">
        <BatchForm existingBatches={batches} onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Batch" size="md">
        {editing && (
          <BatchForm initial={editing} existingBatches={batches} onSave={handleUpdate} onClose={() => setEditing(null)} />
        )}
      </Modal>

      <Modal open={showAddTemplate} onClose={() => setShowAddTemplate(false)} title="Create Call Template" size="lg">
        <TemplateForm onSave={handleCreateTemplate} onClose={() => setShowAddTemplate(false)} />
      </Modal>

      <Modal open={!!editingTemplate} onClose={() => setEditingTemplate(null)} title="Edit Call Template" size="lg">
        {editingTemplate && (
          <TemplateForm initial={editingTemplate} onSave={handleUpdateTemplate} onClose={() => setEditingTemplate(null)} />
        )}
      </Modal>
    </div>
  );
}
