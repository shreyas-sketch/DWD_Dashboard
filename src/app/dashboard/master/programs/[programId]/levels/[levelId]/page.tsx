'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Package, Pencil, Trash2, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useBatches } from '@/hooks/useBatches';
import { useAuth } from '@/contexts/AuthContext';
import { createDocument, updateDocument, deleteDocument } from '@/lib/firestore';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { Program, Level, Batch } from '@/types';

// ─── Batch Form ───────────────────────────────────────────────────────────────
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
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
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
    if (!batchName.trim()) { toast.error('Batch name is required'); return; }
    if (!startDate) { toast.error('Start date is required'); return; }
    if (!endDate) { toast.error('End date is required'); return; }
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
        <Input label="Batch Name" placeholder="Jan 2025 Batch" value={batchName} onChange={(e) => setBatchName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
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
  const [program, setProgram] = useState<Program | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'programs', programId)),
      getDoc(doc(db, 'levels', levelId)),
    ]).then(([pSnap, lSnap]) => {
      if (pSnap.exists()) setProgram({ id: pSnap.id, ...pSnap.data() } as Program);
      if (lSnap.exists()) setLevel({ id: lSnap.id, ...lSnap.data() } as Level);
    });
  }, [programId, levelId]);

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager' || user?.role === 'backend_assist';

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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{level?.name ?? 'Level'}</h1>
          <p className="text-slate-500 text-sm mt-1">{program?.name}</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Batch
          </Button>
        )}
      </div>

      {/* ── Batches ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : batches.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Package size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No batches yet</p>
          <p className="text-slate-600 text-sm mt-1">Create a batch to start adding leads</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {batches.slice(0, 2).map((b) => (
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
                        {b.startDate && <span>{formatDate(b.startDate)}</span>}
                        {b.startDate && b.endDate && <span>→</span>}
                        {b.endDate && <span>{formatDate(b.endDate)}</span>}
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
          {batches.length > 2 && (
            <p className="text-xs text-slate-500 mt-3 text-center">
              Showing 2 of {batches.length} batches (most recent first)
            </p>
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
    </div>
  );
}

