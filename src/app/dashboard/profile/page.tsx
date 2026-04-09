'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { User, Mail, Lock, Save, ShieldCheck } from 'lucide-react';
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ProfilePage() {
  const { user, firebaseUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [nameLoading, setNameLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !user) return;
    setNameLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Name updated successfully');
    } catch {
      toast.error('Failed to update name');
    } finally {
      setNameLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !firebaseUser.email) return;
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setPassLoading(true);
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code ?? '';
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        toast.error('Current password is incorrect');
      } else {
        toast.error('Failed to change password');
      }
    } finally {
      setPassLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold gradient-text">Profile Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account details</p>
      </div>

      {/* Avatar + role */}
      <div className="glass-card p-6 mb-5 flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-500/30">
          {user.displayName?.charAt(0).toUpperCase() ?? 'U'}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">{user.displayName}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
          <span className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
            <ShieldCheck size={11} />
            {user.role.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Edit name */}
      <div className="glass-card p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <User size={16} className="text-indigo-400" />
          Display Name
        </h2>
        <form onSubmit={handleSaveName} className="space-y-4">
          <Input
            label="Full Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            required
          />
          <Button type="submit" loading={nameLoading} className="flex items-center gap-2">
            <Save size={15} />
            Save Name
          </Button>
        </form>
      </div>

      {/* Email (read-only) */}
      <div className="glass-card p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Mail size={16} className="text-indigo-400" />
          Email Address
        </h2>
        <div className="input-glass text-slate-400 cursor-not-allowed opacity-60">
          {user.email}
        </div>
        <p className="text-xs text-slate-600 mt-2">Email cannot be changed. Contact an admin if needed.</p>
      </div>

      {/* Change password */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Lock size={16} className="text-indigo-400" />
          Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            required
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            required
          />
          <Button type="submit" loading={passLoading} className="flex items-center gap-2">
            <Lock size={15} />
            Change Password
          </Button>
        </form>
      </div>
    </div>
  );
}
