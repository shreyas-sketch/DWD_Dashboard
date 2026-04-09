import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
