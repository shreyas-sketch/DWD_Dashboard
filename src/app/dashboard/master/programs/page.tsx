'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, BookOpen, Pencil, Trash2, ChevronRight, User } from 'lucide-react';
import { usePrograms } from '@/hooks/usePrograms';
import { useAuth } from '@/contexts/AuthContext';
import { createDocument, updateDocument, deleteProgramCascade } from '@/lib/firestore';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { Program } from '@/types';

function ProgramForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Program>;
  onSave: (name: string, mentorName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [mentor, setMentor] = useState(initial?.mentorName ?? '');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !mentor.trim()) return;
    setLoading(true);
    try {
      await onSave(name.trim(), mentor.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input label="Program Name" placeholder="e.g. Digital Wealth Domination" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Mentor Name" placeholder="e.g. Deepak Choudhary" value={mentor} onChange={(e) => setMentor(e.target.value)} required />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">{initial?.id ? 'Update' : 'Create'} Program</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ProgramsPage() {
  const { programs, loading } = usePrograms();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);

  async function handleCreate(name: string, mentorName: string) {
    await createDocument<Omit<Program, 'id'>>('programs', {
      name,
      mentorName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user!.uid,
    });
    toast.success('Program created!');
  }

  async function handleUpdate(name: string, mentorName: string) {
    await updateDocument('programs', editing!.id, { name, mentorName });
    toast.success('Program updated!');
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this program? All associated levels, batches, leads and call data will be permanently removed.')) return;
    try {
      await deleteProgramCascade(id);
      toast.success('Program and all its data deleted');
    } catch {
      toast.error('Failed to delete program');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Programs</h1>
          <p className="text-slate-500 text-sm mt-1">Manage training programs and mentors</p>
        </div>
        {user?.role === 'admin' && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Program
          </Button>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : programs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <BookOpen size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No programs yet</p>
          <p className="text-slate-600 text-sm mt-1">Create your first program to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {programs.map((p) => (
            <div key={p.id} className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 text-lg font-bold flex-shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
                    <User size={12} />
                    <span>{p.mentorName}</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-600">
                Created {formatDate(p.createdAt)}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/6">
                <Link
                  href={`/dashboard/master/programs/${p.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors py-1"
                >
                  View Levels <ChevronRight size={14} />
                </Link>
                {user?.role === 'admin' && (
                  <>
                    <button
                      onClick={() => setEditing(p)}
                      className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Program">
        <ProgramForm onSave={handleCreate} onClose={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Program">
        {editing && (
          <ProgramForm initial={editing} onSave={handleUpdate} onClose={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  );
}
