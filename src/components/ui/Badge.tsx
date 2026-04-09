import React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  danger: 'bg-red-500/20 text-red-300 border border-red-500/30',
  info: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn('badge', variantStyles[variant], className)}>
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, BadgeVariant> = {
    admin: 'danger',
    backend_manager: 'purple',
    backend_assist: 'info',
    calling_assist: 'success',
  };
  const labels: Record<string, string> = {
    admin: 'Admin',
    backend_manager: 'Backend Manager',
    backend_assist: 'Backend Assist',
    calling_assist: 'Calling Assist',
  };
  return (
    <Badge variant={map[role] ?? 'default'}>
      {labels[role] ?? role}
    </Badge>
  );
}
