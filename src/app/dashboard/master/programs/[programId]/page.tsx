'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Layers, Pencil, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLevels } from '@/hooks/useLevels';
import { useAuth } from '@/contexts/AuthContext';
import { createDocument, updateDocument, deleteLevelCascade } from '@/lib/firestore';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Program, Level } from '@/types';

function LevelForm({
  initial,
  nextOrder,
  onSave,
  onClose,
}: {
  initial?: Partial<Level>;
  nextOrder: number;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSave(name.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input
        label="Level Name"
        placeholder="e.g. Level 0, Level 1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">
          {initial?.id ? 'Update' : 'Add'} Level
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ProgramDetailPage() {
  const { programId } = useParams<{ programId: string }>();
  const { user } = useAuth();
  const { levels, loading } = useLevels(programId);
  const [program, setProgram] = useState<Program | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Level | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'programs', programId)).then((snap) => {
      if (snap.exists()) setProgram({ id: snap.id, ...snap.data() } as Program);
    });
  }, [programId]);

  async function handleCreate(name: string) {
    await createDocument<Omit<Level, 'id'>>('levels', {
      programId,
      name,
      order: levels.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user!.uid,
    });
    toast.success('Level created!');
  }

  async function handleUpdate(name: string) {
    await updateDocument('levels', editing!.id, { name });
    toast.success('Level updated!');
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this level? All batches, leads and call data inside will be permanently removed.')) return;
    try {
      await deleteLevelCascade(id);
      toast.success('Level and all its data deleted');
    } catch {
      toast.error('Failed to delete level');
    }
  }

  const canEdit = user?.role === 'admin' || user?.role === 'backend_manager';

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/dashboard/master/programs" className="hover:text-slate-300 transition-colors flex items-center gap-1">
          <ChevronLeft size={14} /> Programs
        </Link>
        <span>/</span>
        <span className="text-slate-300">{program?.name ?? '…'}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{program?.name ?? 'Program'}</h1>
          {program?.mentorName && (
            <p className="text-slate-500 text-sm mt-1">Mentor: {program.mentorName}</p>
          )}
        </div>
        {canEdit && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Level
          </Button>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : levels.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Layers size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No levels yet</p>
          <p className="text-slate-600 text-sm mt-1">Add levels to organise your batches</p>
        </div>
      ) : (
        <div className="space-y-3">
          {levels.map((lvl, i) => (
            <div key={lvl.id} className="glass-card p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 text-sm font-bold flex-shrink-0">
                L{i}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100">{lvl.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/master/programs/${programId}/levels/${lvl.id}`}
                  className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Batches <ChevronRight size={14} />
                </Link>
                {canEdit && (
                  <>
                    <button onClick={() => setEditing(lvl)} className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(lvl.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Level">
        <LevelForm nextOrder={levels.length} onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Level">
        {editing && (
          <LevelForm initial={editing} nextOrder={levels.length} onSave={handleUpdate} onClose={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  );
}
