'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { UserPlus, Trash2, Shield, Users, Pencil } from 'lucide-react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, createAuthUserSecondary } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { RoleBadge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import type { UserRole, AppUser } from '@/types';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'backend_manager', label: 'Backend Manager' },
  { value: 'backend_assist', label: 'Backend Assist' },
  { value: 'calling_assist', label: 'Calling Assist' },
];

function EditUserForm({ target, onClose }: { target: AppUser; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(target.displayName);
  const [role, setRole] = useState<UserRole>(target.role);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setLoading(true);
    try {
      await import('firebase/firestore').then(({ updateDoc, doc: fDoc }) =>
        updateDoc(fDoc(db, 'users', target.uid), {
          displayName: displayName.trim(),
          role,
          updatedAt: new Date().toISOString(),
        })
      );
      toast.success('User updated');
      onClose();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'Error updating user');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input
        label="Full Name"
        placeholder="John Doe"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
      <Select
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        options={ROLE_OPTIONS}
      />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Save Changes</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('calling_assist');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !email.trim() || password.length < 8) return;
    setLoading(true);
    try {
      // Create Auth user via secondary app — keeps admin session intact
      const uid = await createAuthUserSecondary(email.trim(), password);
      // Store profile in Firestore
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success(`User "${displayName}" created`);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Error creating user';
      if (msg.includes('email-already-in-use')) {
        toast.error('Email already in use');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <Input
        label="Full Name"
        placeholder="John Doe"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
      <Input
        label="Email"
        type="email"
        placeholder="user@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="Password (min 8 chars)"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      <Select
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        options={ROLE_OPTIONS}
      />
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="flex-1">Create User</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { users, loading } = useUsers();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);

  // Guard: admin only
  if (!loading && user?.role !== 'admin') {
    router.replace('/dashboard');
    return null;
  }

  async function handleDelete(uid: string, name: string) {
    if (uid === user?.uid) { toast.error("You can't delete your own account"); return; }
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'users', uid));
    toast.success(`User deleted`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">User Management</h1>
          <p className="text-slate-500 text-sm mt-1">Create and manage system users</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> Add User
        </Button>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-slate-500">Loading…</div>
      ) : users.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Users size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No users yet</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-glass w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                          {u.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-200">{u.displayName}</span>
                        {u.uid === user?.uid && (
                          <span className="text-xs text-slate-600">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="text-slate-400 text-sm">{u.email}</td>
                    <td><RoleBadge role={u.role} /></td>
                    <td className="text-slate-500 text-sm">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTarget(u)}
                          className="p-1.5 text-slate-600 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-500/10"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(u.uid, u.displayName)}
                          className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                          disabled={u.uid === user?.uid}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* API Key section */}
      <div className="glass-card p-5 mt-6">
        <div className="flex items-start gap-3 mb-4">
          <Shield size={18} className="text-indigo-400 mt-0.5" />
          <div>
            <h2 className="font-semibold text-slate-200">API / Webhook Access</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Use the webhook endpoint to push leads from external tools like Pabbly or Zapier.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-white/3 border border-white/8 p-3 overflow-x-auto">
          <code className="text-xs text-indigo-300">
            POST /api/webhooks/leads
          </code>
          <p className="text-xs text-slate-500 mt-2">
            Required headers: <code className="text-slate-300">x-api-key: YOUR_API_KEY</code>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Body: <code className="text-slate-300">{'{ "batchId": "...", "name": "...", "email": "...", "phone": "..." }'}</code>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Set <code className="text-slate-300">WEBHOOK_API_KEY</code> in your environment variables.
          </p>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New User">
        <CreateUserForm onClose={() => setShowCreate(false)} />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit User">
        {editTarget && <EditUserForm target={editTarget} onClose={() => setEditTarget(null)} />}
      </Modal>
    </div>
  );
}
