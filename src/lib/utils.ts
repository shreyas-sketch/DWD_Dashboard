import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { CallSession, CallSessionType } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateSerialNumbers(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

/**
 * Distribute lead objects equally among handlers.
 * Returns leads enriched with handlerId and handlerName.
 */
export function distributeLeads<T extends { id: string }>(
  leads: T[],
  handlers: { uid: string; displayName: string }[],
): Array<T & { handlerId: string; handlerName: string }> {
  if (!handlers.length) return leads.map((l) => ({ ...l, handlerId: '', handlerName: 'Unassigned' }));
  return leads.map((lead, idx) => {
    const handler = handlers[idx % handlers.length];
    return { ...lead, handlerId: handler.uid, handlerName: handler.displayName };
  });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const CALL_SESSION_TYPE_LABELS: Record<CallSessionType, string> = {
  main: 'Main Call',
  doubt1: 'Doubt Call 1',
  doubt2: 'Doubt Call 2',
};

export function getCallSessionTypeOrder(type?: CallSessionType): number {
  switch (type) {
    case 'doubt1':
      return 1;
    case 'doubt2':
      return 2;
    case 'main':
    default:
      return 0;
  }
}

export function getCallSessionTypeLabel(type?: CallSessionType): string {
  return CALL_SESSION_TYPE_LABELS[type ?? 'main'];
}

export function getCallSessionGroupKey(call: Pick<CallSession, 'date' | 'name' | 'order'>): string {
  return [call.date, String(call.order), call.name.trim().toLowerCase()].join('__');
}

export function sortCallSessions<T extends CallSession>(calls: T[]): T[] {
  return [...calls].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) return byDate;

    const byOrder = left.order - right.order;
    if (byOrder !== 0) return byOrder;

    const byType = getCallSessionTypeOrder(left.sessionType) - getCallSessionTypeOrder(right.sessionType);
    if (byType !== 0) return byType;

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function formatCallSessionLabel(call: CallSession): string {
  return `${formatDate(call.date)} — ${call.name} (${getCallSessionTypeLabel(call.sessionType)})`;
}

// ─── Status color helpers ─────────────────────────────────────────────────────

const CA_RED = new Set(['Out Of Service-NR', 'Incoming Inactive-NR', "Won't Attend-NR"]);
const CA_GREEN = new Set(['Will Attend/Will join', 'Message Sent']);
const CA_BLUE = new Set(['Call Them']);

export function isCallingAssistRedFlag(status: string): boolean {
  return CA_RED.has(status);
}

/** Text color class for a calling-assist status value. */
export function getCallingAssistColor(status: string): string {
  if (!status) return 'text-slate-400';
  if (CA_RED.has(status)) return 'text-red-400';
  if (CA_GREEN.has(status)) return 'text-emerald-400';
  if (CA_BLUE.has(status)) return 'text-sky-400';
  return 'text-slate-200';
}

/** Badge classes (text + bg + border) for a calling-assist status. */
export function getCallingAssistBadge(status: string): string {
  if (CA_RED.has(status)) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (CA_GREEN.has(status)) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (CA_BLUE.has(status)) return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
  return 'text-slate-200 bg-white/5 border-white/10';
}

/** Card bg+border classes for a calling-assist status. */
export function getCallingAssistCardBg(status: string): string {
  if (CA_RED.has(status)) return 'bg-red-500/8 border-red-500/20';
  if (CA_GREEN.has(status)) return 'bg-emerald-500/8 border-emerald-500/20';
  if (CA_BLUE.has(status)) return 'bg-sky-500/8 border-sky-500/20';
  return 'bg-white/3 border-white/6';
}

const H_RED = new Set(['Out Of Service-NR', 'Incoming Inactive-NR', "Won't Attend-NR", "Don't Call Them"]);
const H_GREEN = new Set(['Will Attend/Will join', 'Message Sent']);

/** Text color class for a handler status value. */
export function getHandlerStatusColor(status: string): string {
  if (!status) return 'text-slate-400';
  if (H_RED.has(status)) return 'text-red-400';
  if (status === 'Dropped from call') return 'text-red-600';
  if (status === 'JOINED') return 'text-green-600';
  if (status === 'Not Active') return 'text-yellow-600';
  if (H_GREEN.has(status)) return 'text-emerald-400';
  if (status === 'Call Them') return 'text-sky-400';
  return 'text-slate-200';
}

/** Card bg+border classes for a handler status. */
export function getHandlerCardBg(status: string): string {
  if (H_RED.has(status)) return 'bg-red-500/8 border-red-500/20';
  if (status === 'Dropped from call') return 'bg-red-600/10 border-red-600/25';
  if (status === 'JOINED') return 'bg-green-600/10 border-green-600/25';
  if (status === 'Not Active') return 'bg-yellow-600/10 border-yellow-600/25';
  if (H_GREEN.has(status)) return 'bg-emerald-500/8 border-emerald-500/20';
  if (status === 'Call Them') return 'bg-sky-500/8 border-sky-500/20';
  return 'bg-white/3 border-white/6';
}
