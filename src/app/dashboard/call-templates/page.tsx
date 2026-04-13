'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, ClipboardList, Pencil, Trash2, GripVertical, X } from 'lucide-react';
import { useAllCallTemplates } from '@/hooks/useAllCallTemplates';
import { usePrograms } from '@/hooks/usePrograms';
import { useLevels } from '@/hooks/useLevels';
import { useAuth } from '@/contexts/AuthContext';
import { createDocument, updateDocument, deleteDocument } from '@/lib/firestore';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { CallTemplate, CallTemplateEntry, CallSessionType } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────
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
  onSave: (templateName: string, entries: CallTemplateEntry[], programId: string, levelId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { programs } = usePrograms();
  const [selectedProgramId, setSelectedProgramId] = useState(initial?.programId ?? '');
  const { levels } = useLevels(selectedProgramId || null);
  const [selectedLevelId, setSelectedLevelId] = useState(initial?.levelId ?? '');
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
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, name } : e)));
  }

  function toggleEntrySessionType(i: number, st: CallSessionType) {
    setEntries((prev) =>
      prev.map((e, idx) => {
        if (idx !== i) return e;
        const has = e.sessionTypes.includes(st);
        return { ...e, sessionTypes: has ? e.sessionTypes.filter((s) => s !== st) : [...e.sessionTypes, st] };
      }),
    );
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!templateName.trim()) return;
    if (!selectedProgramId || !selectedLevelId) {
      toast.error('Please select a program and level');
      return;
    }
    const validEntries = entries.filter((en) => en.name.trim() && en.sessionTypes.length > 0);
    if (validEntries.length === 0) {
      toast.error('Add at least one call entry');
      return;
    }
    setLoading(true);
    try {
      await onSave(templateName.trim(), validEntries, selectedProgramId, selectedLevelId);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      {/* Program / Level selectors — hidden when editing (locked to existing) */}
      {!initial && (
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Program"
            value={selectedProgramId}
            onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedLevelId(''); }}
            options={[
              { value: '', label: 'Select program…' },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Select
            label="Level"
            value={selectedLevelId}
            onChange={(e) => setSelectedLevelId(e.target.value)}
            disabled={!selectedProgramId}
            options={[
              { value: '', label: selectedProgramId ? 'Select level…' : '—' },
              ...levels.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        </div>
      )}

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
                    onClick={() => setEntryName(i, p)}
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
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CallTemplatesPage() {
  const { user } = useAuth();
  const { templates, loading } = useAllCallTemplates();
  const { programs } = usePrograms();
  const [showAdd, setShowAdd] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CallTemplate | null>(null);

  const canManage = user?.role === 'admin' || user?.role === 'backend_manager';

  async function handleCreate(
    templateName: string,
    entries: CallTemplateEntry[],
    programId: string,
    levelId: string,
  ) {
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

  async function handleUpdate(
    templateName: string,
    entries: CallTemplateEntry[],
    programId: string,
    levelId: string,
  ) {
    if (!editingTemplate) return;
    await updateDocument('callTemplates', editingTemplate.id, { templateName, entries, programId, levelId });
    toast.success('Template updated!');
    setEditingTemplate(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this call template?')) return;
    await deleteDocument('callTemplates', id);
    toast.success('Template deleted');
  }

  // Group templates by programId
  const grouped = templates.reduce<Record<string, CallTemplate[]>>((acc, t) => {
    if (!acc[t.programId]) acc[t.programId] = [];
    acc[t.programId].push(t);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Call Templates</h1>
          <p className="text-slate-500 text-sm mt-1">Manage reusable call schedules for batches</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> New Template
          </Button>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No call templates yet</p>
          {canManage && (
            <p className="text-slate-600 text-sm mt-1">
              Create a template to quickly add calls to new batches
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([programId, programTemplates]) => {
            const program = programs.find((p) => p.id === programId);
            return (
              <div key={programId}>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  {program?.name ?? programId}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {programTemplates.map((t) => (
                    <div key={t.id} className="glass-card p-5 flex flex-col gap-3">
                      <div className="flex items-start gap-2">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 flex-shrink-0">
                          <ClipboardList size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-100 truncate">{t.templateName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {t.entries.length} call{t.entries.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        {canManage && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => setEditingTemplate(t)}
                              className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Entry list preview */}
                      <div className="space-y-1.5">
                        {t.entries.map((entry, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/3 border border-white/6"
                          >
                            <span className="text-slate-500 w-4 flex-shrink-0">{i + 1}.</span>
                            <span className="text-slate-300 flex-1 truncate">{entry.name}</span>
                            <div className="flex gap-1">
                              {entry.sessionTypes.map((st) => (
                                <span
                                  key={st}
                                  className="px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px]"
                                >
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
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Create Call Template" size="lg">
        <TemplateForm onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!editingTemplate} onClose={() => setEditingTemplate(null)} title="Edit Call Template" size="lg">
        {editingTemplate && (
          <TemplateForm
            initial={editingTemplate}
            onSave={handleUpdate}
            onClose={() => setEditingTemplate(null)}
          />
        )}
      </Modal>
    </div>
  );
}
