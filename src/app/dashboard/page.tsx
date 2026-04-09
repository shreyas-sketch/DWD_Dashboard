'use client';

import React from 'react';
import { Users, BookOpen, ClipboardList, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/usePrograms';
import { useUsers } from '@/hooks/useUsers';
import { formatDateTime } from '@/lib/utils';

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-slate-400 text-sm">{label}</p>
        <p className="text-2xl font-bold text-slate-100 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const { users } = useUsers();

  const now = formatDateTime(new Date().toISOString());

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold gradient-text">
          Welcome back, {user?.displayName?.split(' ')[0] ?? 'User'} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">{now}</p>
      </div>

      {/* Stats — Admin / Backend Manager */}
      {(user?.role === 'admin' || user?.role === 'backend_manager') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<BookOpen size={20} />}
            label="Total Programs"
            value={programs.length}
          />
          <StatCard
            icon={<Users size={20} />}
            label="Team Members"
            value={users.length}
          />
          <StatCard
            icon={<ClipboardList size={20} />}
            label="Your Role"
            value={user.role === 'admin' ? 'Admin' : 'Backend Manager'}
            sub="Full access"
          />
          <StatCard
            icon={<TrendingUp size={20} />}
            label="System Status"
            value="Live"
            sub="All systems operational"
          />
        </div>
      )}

      {/* Programs overview */}
      {(user?.role === 'admin' || user?.role === 'backend_manager') && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Programs Overview</h2>
          {programs.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No programs yet. Go to Master → Programs to create your first program.
            </p>
          ) : (
            <div className="space-y-3">
              {programs.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-white/3 border border-white/6"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">Mentor: {p.mentorName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Backend Assist / Calling Assist view */}
      {(user?.role === 'backend_assist' || user?.role === 'calling_assist') && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Your Workspace</h2>
          <p className="text-slate-400 text-sm">
            Go to <strong className="text-indigo-400">Assign Data</strong> in the sidebar to
            view your assigned leads and update call reports.
          </p>
        </div>
      )}
    </div>
  );
}
