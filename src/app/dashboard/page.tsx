'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  Users, BookOpen, ClipboardList, TrendingUp, BarChart2,
  Phone, Award, ArrowRight, Layers, FileText, Zap, Activity,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/usePrograms';
import { useUsers } from '@/hooks/useUsers';
import { useAssignedBatches } from '@/hooks/useAssignedBatches';
import { formatDateTime } from '@/lib/utils';

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'indigo',
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'indigo' | 'purple' | 'emerald' | 'amber' | 'sky' | 'rose';
  href?: string;
}) {
  const colorMap = {
    indigo: 'bg-indigo-500/12 text-indigo-400 border-indigo-500/20',
    purple: 'bg-purple-500/12 text-purple-400 border-purple-500/20',
    emerald: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/12 text-amber-400 border-amber-500/20',
    sky: 'bg-sky-500/12 text-sky-400 border-sky-500/20',
    rose: 'bg-rose-500/12 text-rose-400 border-rose-500/20',
  };

  const card = (
    <div className={`glass-card p-5 flex items-start gap-4 transition-all duration-200 ${href ? 'hover:scale-[1.02] cursor-pointer' : ''}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${colorMap[color]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
      {href && <ArrowRight size={16} className="text-slate-600 mt-1 flex-shrink-0" />}
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

// ─── Quick Action ─────────────────────────────────────────────────────────────
function QuickAction({
  icon,
  label,
  description,
  href,
  color = 'indigo',
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  href: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'from-indigo-500/20 to-indigo-500/5 border-indigo-500/15 hover:border-indigo-500/30',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/15 hover:border-purple-500/30',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/15 hover:border-emerald-500/30',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/15 hover:border-amber-500/30',
    sky: 'from-sky-500/20 to-sky-500/5 border-sky-500/15 hover:border-sky-500/30',
  };

  return (
    <Link
      href={href}
      className={`group rounded-2xl p-4 border bg-gradient-to-br transition-all duration-200 hover:scale-[1.02] ${colorMap[color] ?? colorMap.indigo}`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 group-hover:text-slate-100">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <ArrowRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const { users } = useUsers();
  const { batches: assignedBatches } = useAssignedBatches(
    (user?.role === 'calling_assist' || user?.role === 'backend_assist') ? user.uid : null,
  );

  const now = formatDateTime(new Date().toISOString());

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => { counts[u.role] = (counts[u.role] ?? 0) + 1; });
    return counts;
  }, [users]);

  const roleLabel = user?.role
    ? { admin: 'Administrator', backend_manager: 'Backend Manager', backend_assist: 'Backend Assistant', calling_assist: 'Calling Assistant' }[user.role]
    : 'User';

  // ── Admin / Backend Manager view ────────────────────────────────────────────
  if (user?.role === 'admin' || user?.role === 'backend_manager') {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold gradient-text">
              Welcome back, {user.displayName?.split(' ')[0] ?? 'User'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">{roleLabel} &middot; {now}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">System Live</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<BookOpen size={20} />}
            label="Programs"
            value={programs.length}
            sub={programs.length > 0 ? `Latest: ${programs[programs.length - 1]?.name}` : 'Create your first program'}
            color="indigo"
            href="/dashboard/master/programs"
          />
          <StatCard
            icon={<Users size={20} />}
            label="Team Members"
            value={users.length}
            sub={`${roleCounts['admin'] ?? 0} admin, ${roleCounts['backend_assist'] ?? 0} backend, ${roleCounts['calling_assist'] ?? 0} calling`}
            color="purple"
            href={user.role === 'admin' ? '/dashboard/users' : undefined}
          />
          <StatCard
            icon={<BarChart2 size={20} />}
            label="Reports"
            value="View"
            sub="Registration, calling & handler analytics"
            color="emerald"
            href="/dashboard/report"
          />
          <StatCard
            icon={<Activity size={20} />}
            label="Role"
            value={roleLabel}
            sub="Full dashboard access"
            color="amber"
          />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickAction
              icon={<BookOpen size={18} className="text-indigo-400" />}
              label="Programs"
              description="View and manage programs, levels & batches"
              href="/dashboard/master/programs"
              color="indigo"
            />
            <QuickAction
              icon={<ClipboardList size={18} className="text-purple-400" />}
              label="Assign Data"
              description="Assign leads and manage call reports"
              href="/dashboard/assign-data"
              color="purple"
            />
            <QuickAction
              icon={<BarChart2 size={18} className="text-emerald-400" />}
              label="Reports"
              description="View registration & calling analytics"
              href="/dashboard/report"
              color="emerald"
            />
            {user.role === 'admin' && (
              <>
                <QuickAction
                  icon={<Users size={18} className="text-sky-400" />}
                  label="Users"
                  description="Manage team members and roles"
                  href="/dashboard/users"
                  color="sky"
                />
                <QuickAction
                  icon={<FileText size={18} className="text-amber-400" />}
                  label="Call Templates"
                  description="Create reusable call session templates"
                  href="/dashboard/call-templates"
                  color="amber"
                />
                <QuickAction
                  icon={<Zap size={18} className="text-purple-400" />}
                  label="Webhooks & API"
                  description="Connect Zapier, Pabbly integrations"
                  href="/dashboard/webhooks"
                  color="purple"
                />
              </>
            )}
          </div>
        </div>

        {/* Programs List */}
        {programs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Programs</h2>
              <Link href="/dashboard/master/programs" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {programs.slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/master/programs/${p.id}`}
                  className="glass-card p-4 hover:scale-[1.02] transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/15 flex items-center justify-center text-indigo-400 text-sm font-bold flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-indigo-400 transition-colors">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Mentor: {p.mentorName}</p>
                    </div>
                    <ArrowRight size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Backend Assist view ─────────────────────────────────────────────────────
  if (user?.role === 'backend_assist') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold gradient-text">
            Welcome back, {user.displayName?.split(' ')[0] ?? 'User'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Backend Assistant &middot; {now}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Layers size={20} />}
            label="Assigned Batches"
            value={assignedBatches.length}
            sub={assignedBatches.length > 0 ? `Latest: ${assignedBatches[0]?.batchName || `Batch ${assignedBatches[0]?.batchNumber}`}` : 'No batches assigned yet'}
            color="indigo"
            href="/dashboard/assign-data"
          />
          <StatCard
            icon={<ClipboardList size={20} />}
            label="Your Role"
            value="Backend Assist"
            sub="Handler reports & lead management"
            color="purple"
          />
          <StatCard
            icon={<Award size={20} />}
            label="Tasks"
            value="Assign Data"
            sub="Update handler reports for your leads"
            color="emerald"
            href="/dashboard/assign-data"
          />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickAction
              icon={<ClipboardList size={18} className="text-indigo-400" />}
              label="Assign Data"
              description="Update call reports for your assigned leads"
              href="/dashboard/assign-data"
              color="indigo"
            />
            <QuickAction
              icon={<Layers size={18} className="text-purple-400" />}
              label="Manage Batch"
              description="View and manage your batch data"
              href="/dashboard/manage-batch"
              color="purple"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Calling Assist view ─────────────────────────────────────────────────────
  if (user?.role === 'calling_assist') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold gradient-text">
            Welcome back, {user.displayName?.split(' ')[0] ?? 'User'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Calling Assistant &middot; {now}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Phone size={20} />}
            label="Assigned Batches"
            value={assignedBatches.length}
            sub={assignedBatches.length > 0 ? `Latest: ${assignedBatches[0]?.batchName || `Batch ${assignedBatches[0]?.batchNumber}`}` : 'No batches assigned yet'}
            color="sky"
            href="/dashboard/assign-data"
          />
          <StatCard
            icon={<ClipboardList size={20} />}
            label="Your Role"
            value="Calling Assist"
            sub="Call leads & update calling reports"
            color="purple"
          />
          <StatCard
            icon={<TrendingUp size={20} />}
            label="Get Started"
            value="Assign Data"
            sub="Open your assigned leads to start calling"
            color="emerald"
            href="/dashboard/assign-data"
          />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickAction
              icon={<ClipboardList size={18} className="text-indigo-400" />}
              label="Assign Data"
              description="View assigned leads and update call status"
              href="/dashboard/assign-data"
              color="indigo"
            />
            <QuickAction
              icon={<Phone size={18} className="text-sky-400" />}
              label="Your Profile"
              description="View and update your profile details"
              href="/dashboard/profile"
              color="sky"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback ────────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-500">Loading dashboard...</p>
    </div>
  );
}
