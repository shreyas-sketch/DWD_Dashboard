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
