'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Webhook, Plus, Trash2, RefreshCw, CheckCircle2,
  ExternalLink, Zap, ToggleLeft, ToggleRight, BookOpen,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { WebhookEvent, WebhookSetting } from '@/types';

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiCall(path: string, options: RequestInit = {}) {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-firebase-token': token, ...(options.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EVENT_LABELS: Record<WebhookEvent, { label: string; color: string }> = {
  lead_created: { label: 'Lead Created', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  batch_created: { label: 'Batch Created', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  lead_updated: { label: 'Lead Updated', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
};
const ALL_EVENTS: WebhookEvent[] = ['lead_created', 'batch_created', 'lead_updated'];

// ─── Webhook Form Modal ──────────────────────────────────────────────────────
function WebhookFormModal({
  initial,
  onClose,
}: {
  initial?: WebhookSetting | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [events, setEvents] = useState<WebhookEvent[]>(initial?.events ?? ['lead_created']);
  const [loading, setLoading] = useState(false);

  function toggleEvent(e: WebhookEvent) {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Enter a name'); return; }
    if (!url.trim() || !url.startsWith('http')) { toast.error('Enter a valid URL starting with http(s)://'); return; }
    if (events.length === 0) { toast.error('Select at least one event'); return; }

    setLoading(true);
    try {
      if (initial) {
        await apiCall('/api/webhooks/manage', {
          method: 'PATCH',
          body: JSON.stringify({ id: initial.id, name: name.trim(), url: url.trim(), events }),
        });
        toast.success('Webhook updated');
      } else {
        await apiCall('/api/webhooks/manage', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), url: url.trim(), events }),
        });
        toast.success('Webhook created');
      }
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save webhook');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input label="Name" placeholder="e.g. Zapier – New Lead" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Webhook URL" placeholder="https://hooks.zapier.com/hooks/catch/…" value={url} onChange={(e) => setUrl(e.target.value)} />

      <div>
        <p className="text-xs font-medium text-slate-400 mb-2">Trigger Events</p>
        <div className="space-y-2">
          {ALL_EVENTS.map((ev) => {
            const meta = EVENT_LABELS[ev];
            const checked = events.includes(ev);
            return (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${checked ? `${meta.color} border-current/30 bg-current/10` : 'border-white/8 bg-white/3 text-slate-400 hover:text-slate-200'}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'border-current bg-current/20' : 'border-slate-600'}`}>
                    {checked && <CheckCircle2 size={10} />}
                  </div>
                  <span className="text-xs font-semibold">{meta.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <Button className="flex-1" onClick={handleSave} loading={loading}>
          {initial ? 'Save Changes' : 'Create Webhook'}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function WebhooksPage() {
  const { user } = useAuth();
  const [webhooks, setWebhooks] = useState<WebhookSetting[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<WebhookSetting | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  async function loadWebhooks() {
    try {
      const json = await apiCall('/api/webhooks/manage');
      setWebhooks(json.webhooks as WebhookSetting[]);
    } catch (err) {
      console.error('[webhooks] failed to load', err);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { loadWebhooks(); }, []);

  async function handleToggleActive(hook: WebhookSetting) {
    try {
      await apiCall('/api/webhooks/manage', {
        method: 'PATCH',
        body: JSON.stringify({ id: hook.id, active: !hook.active }),
      });
      setWebhooks((prev) => prev.map((h) => h.id === hook.id ? { ...h, active: !hook.active } : h));
    } catch {
      toast.error('Failed to update webhook');
    }
  }

  async function handleDelete(hook: WebhookSetting) {
    if (!confirm(`Delete webhook "${hook.name}"?`)) return;
    try {
      await apiCall(`/api/webhooks/manage?id=${hook.id}`, { method: 'DELETE' });
      setWebhooks((prev) => prev.filter((h) => h.id !== hook.id));
      toast.success('Webhook deleted');
    } catch {
      toast.error('Failed to delete webhook');
    }
  }

  async function handleTest(hook: WebhookSetting) {
    setTesting(hook.id);
    try {
      const json = await apiCall('/api/webhooks/fire', {
        method: 'POST',
        body: JSON.stringify({
          event: hook.events[0],
          data: { test: true, webhookId: hook.id, timestamp: new Date().toISOString() },
        }),
      });
      toast.success(`Test sent — ${json.fired?.[0]?.status ?? 'delivered'}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(null);
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text mb-1">Webhooks & API</h1>
          <p className="text-slate-500 text-sm">Manage outbound webhooks for Zapier, Pabbly, or any HTTP tool.</p>
        </div>
        <Link
          href="/dashboard/webhooks/docs"
          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors px-4 py-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10"
        >
          <BookOpen size={15} /> API Documentation
        </Link>
      </div>

      {/* Quick ID Tip */}
      <div className="glass-card p-4 rounded-2xl flex items-start gap-3">
        <Zap size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-slate-400">
          <span className="text-slate-300 font-medium">Need Program ID, Level ID, or Batch ID?</span>{' '}
          Go to <Link href="/dashboard/master/programs" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Master &rarr; Programs</Link> and
          click the copy icon next to any program, level, or batch.
        </div>
      </div>

      {/* Outbound Webhooks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <ExternalLink size={16} className="text-indigo-400" /> Outbound Webhooks
          </h2>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Webhook
          </Button>
        </div>

        {loadingList ? (
          <div className="glass-card p-8 text-center text-slate-500 text-sm">Loading&hellip;</div>
        ) : webhooks.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
              <Webhook size={22} className="text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm font-medium">No outbound webhooks yet</p>
            <p className="text-slate-600 text-xs">Add a Zapier or Pabbly &quot;Catch Hook&quot; URL to push events out automatically.</p>
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>
              <Plus size={13} /> Add Your First Webhook
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((hook) => (
              <div key={hook.id} className="glass-card rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-slate-200">{hook.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hook.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500'}`}>
                        {hook.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate mb-2">{hook.url}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hook.events.map((ev) => (
                        <span key={ev} className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium ${EVENT_LABELS[ev]?.color ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>
                          {EVENT_LABELS[ev]?.label ?? ev}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleTest(hook)}
                      disabled={testing === hook.id}
                      className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-500/10"
                      title="Send test event"
                    >
                      {testing === hook.id ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                    </button>
                    <button
                      onClick={() => handleToggleActive(hook)}
                      className="p-1.5 text-slate-500 hover:text-amber-400 transition-colors rounded-lg hover:bg-amber-500/10"
                      title={hook.active ? 'Pause' : 'Activate'}
                    >
                      {hook.active ? <ToggleRight size={15} className="text-emerald-400" /> : <ToggleLeft size={15} />}
                    </button>
                    <button
                      onClick={() => setEditing(hook)}
                      className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
                      title="Edit"
                    >
                      <Webhook size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(hook)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Outbound Webhook" solid>
        <WebhookFormModal onClose={() => { setShowAdd(false); loadWebhooks(); }} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Webhook" solid>
        {editing && <WebhookFormModal initial={editing} onClose={() => { setEditing(null); loadWebhooks(); }} />}
      </Modal>
    </div>
  );
}
