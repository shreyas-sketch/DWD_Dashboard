'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Webhook, Plus, Trash2, RefreshCw, Copy, CheckCircle2, ArrowUpRight,
  ExternalLink, Info, Zap, AlertTriangle, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { WebhookEvent, WebhookSetting } from '@/types';

// ─── Constants ─────────────────────────────────────────────────────────────────
const EVENT_LABELS: Record<WebhookEvent, { label: string; description: string; color: string }> = {
  lead_created: {
    label: 'Lead Created',
    description: 'Fires when a lead is added to any batch via the API.',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  batch_created: {
    label: 'Batch Created',
    description: 'Fires when a new batch is created via the API.',
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  lead_updated: {
    label: 'Lead Updated',
    description: 'Fires when a lead is updated via the API.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
};

const ALL_EVENTS: WebhookEvent[] = ['lead_created', 'batch_created', 'lead_updated'];

// ─── Inbound API Docs ────────────────────────────────────────────────────────
const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

const INBOUND_DOCS = [
  {
    title: 'Add Lead to Batch',
    method: 'POST',
    path: '/api/webhooks/leads',
    color: 'text-green-400',
    bg: 'bg-green-500/8',
    description: 'Create a lead inside an existing batch. Two lookup modes:',
    examples: [
      {
        label: 'By batchId (simplest)',
        body: JSON.stringify({ batchId: 'BATCH_ID', name: 'Jane Doe', email: 'jane@example.com', phone: '+91 9876543210' }, null, 2),
      },
      {
        label: 'By program + level (Zapier-friendly)',
        body: JSON.stringify({ programId: 'PROGRAM_ID', levelId: 'LEVEL_ID', name: 'Jane Doe', email: 'jane@example.com', phone: '+91 9876543210' }, null, 2),
      },
      {
        label: 'By program + level + batch number',
        body: JSON.stringify({ programId: 'PROGRAM_ID', levelId: 'LEVEL_ID', batchNumber: '001', name: 'Jane Doe', email: 'jane@example.com', phone: '+91 9876543210' }, null, 2),
      },
    ],
    response: JSON.stringify({ success: true, leadId: 'abc123', batchId: 'xyz', serialNumber: 42 }, null, 2),
  },
  {
    title: 'Create a Batch',
    method: 'POST',
    path: '/api/webhooks/batches',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/8',
    description: 'Create a new batch in a program level.',
    examples: [
      {
        label: 'Minimal',
        body: JSON.stringify({ programId: 'PROGRAM_ID', levelId: 'LEVEL_ID', batchNumber: '001', batchName: 'Batch A' }, null, 2),
      },
    ],
    response: JSON.stringify({ success: true, batchId: 'newBatchId' }, null, 2),
  },
  {
    title: 'Look Up IDs',
    method: 'GET',
    path: '/api/webhooks/info',
    color: 'text-amber-400',
    bg: 'bg-amber-500/8',
    description: 'Resolve names to IDs. Use in a Zapier "Lookup Spreadsheet Row" or "Code" step.',
    examples: [
      { label: 'List all programs', body: '?resource=programs' },
      { label: 'List levels for a program', body: '?resource=levels&programId=PROGRAM_ID' },
      { label: 'List batches for a level', body: '?resource=batches&levelId=LEVEL_ID' },
    ],
    response: JSON.stringify({ items: [{ id: 'abc', name: 'Level 0', order: 0 }] }, null, 2),
  },
  {
    title: 'Get Leads from Batch',
    method: 'GET',
    path: '/api/webhooks/leads',
    color: 'text-sky-400',
    bg: 'bg-sky-500/8',
    description: 'Export all leads from a batch.',
    examples: [{ label: 'By batchId', body: '?batchId=BATCH_ID' }],
    response: JSON.stringify({ leads: [{ id: '…', name: 'Jane', email: 'jane@example.com', serialNumber: 1 }], count: 1 }, null, 2),
  },
];

// ─── Copy helper ──────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="p-1 text-slate-500 hover:text-slate-200 transition-colors rounded"
      title="Copy"
    >
      {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

// ─── Add / Edit Webhook Modal ─────────────────────────────────────────────────
function WebhookFormModal({
  initial,
  onClose,
}: {
  initial?: WebhookSetting | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
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
        await updateDoc(doc(db, 'webhooks', initial.id), {
          name: name.trim(), url: url.trim(), events, updatedAt: new Date().toISOString(),
        });
        toast.success('Webhook updated');
      } else {
        await addDoc(collection(db, 'webhooks'), {
          name: name.trim(), url: url.trim(), events, active: true,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          createdBy: user!.uid,
        });
        toast.success('Webhook created');
      }
      onClose();
    } catch (err) {
      toast.error('Failed to save webhook');
      console.error(err);
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
                  <div>
                    <p className="text-xs font-semibold">{meta.label}</p>
                    <p className="text-[11px] opacity-70 mt-0.5">{meta.description}</p>
                  </div>
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
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [expandedExample, setExpandedExample] = useState<Record<number, number>>({});
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'webhooks'), (snap) => {
      setWebhooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WebhookSetting)));
    });
    return unsub;
  }, []);

  async function handleToggleActive(hook: WebhookSetting) {
    await updateDoc(doc(db, 'webhooks', hook.id), {
      active: !hook.active, updatedAt: new Date().toISOString(),
    });
  }

  async function handleDelete(hook: WebhookSetting) {
    if (!confirm(`Delete webhook "${hook.name}"?`)) return;
    await deleteDoc(doc(db, 'webhooks', hook.id));
    toast.success('Webhook deleted');
  }

  async function handleTest(hook: WebhookSetting) {
    setTesting(hook.id);
    try {
      const idToken = await (await import('firebase/auth')).getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/webhooks/fire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          event: hook.events[0],
          data: { test: true, webhookId: hook.id, timestamp: new Date().toISOString() },
        }),
      });
      const json = await res.json();
      if (res.ok) toast.success(`Test sent — ${json.fired?.[0]?.status ?? 'delivered'}`);
      else toast.error(json.error ?? 'Test failed');
    } catch (err) {
      toast.error('Test request failed');
      console.error(err);
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text mb-1">Webhooks & API</h1>
        <p className="text-slate-500 text-sm">Connect with Zapier, Pabbly, or any HTTP integration tool.</p>
      </div>

      {/* Authentication info */}
      <div className="glass-card p-5 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Info size={15} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-200">Authentication</h2>
        </div>
        <p className="text-xs text-slate-500">
          All inbound API calls require the header <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded">x-api-key: YOUR_KEY</code>.
          Set <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded">WEBHOOK_API_KEY</code> in your Vercel environment variables to any secure random string (32+ characters).
        </p>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/3 border border-white/8 text-xs font-mono text-slate-300">
          <span className="text-slate-500">Header:</span>
          <span className="flex-1">x-api-key: [your WEBHOOK_API_KEY value]</span>
          <CopyButton text="x-api-key: YOUR_WEBHOOK_API_KEY" />
        </div>
      </div>

      {/* Inbound API Reference */}
      <div>
        <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <ArrowUpRight size={16} className="text-emerald-400" /> Inbound — Zapier/Pabbly → Dashboard
        </h2>
        <div className="space-y-3">
          {INBOUND_DOCS.map((doc, i) => (
            <div key={i} className={`glass-card rounded-2xl overflow-hidden border border-white/8`}>
              <button
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/2 transition-colors"
                onClick={() => setExpandedDoc(expandedDoc === i ? null : i)}
              >
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${doc.bg} ${doc.color} border border-current/20`}>
                  {doc.method}
                </span>
                <code className="text-xs text-slate-300 font-mono flex-1">{doc.path}</code>
                <span className="text-sm font-medium text-slate-300">{doc.title}</span>
                <span className="text-slate-600 text-xs">{expandedDoc === i ? '▲' : '▼'}</span>
              </button>

              {expandedDoc === i && (
                <div className="px-5 pb-5 space-y-4 border-t border-white/8 pt-4">
                  <p className="text-xs text-slate-400">{doc.description}</p>

                  {/* Example selector */}
                  {doc.examples.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {doc.examples.map((ex, j) => (
                        <button
                          key={j}
                          onClick={() => setExpandedExample((p) => ({ ...p, [i]: j }))}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${(expandedExample[i] ?? 0) === j ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-white/8 bg-white/3 text-slate-400 hover:text-slate-200'}`}
                        >
                          {ex.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                        {doc.method === 'GET' ? 'Query' : 'Body'} — {doc.examples[(expandedExample[i] ?? 0)]?.label}
                      </p>
                      <div className="flex items-center gap-2">
                        <CopyButton text={`${baseUrl}${doc.path}`} />
                        <code className="text-[11px] text-slate-500 font-mono">{baseUrl}{doc.path}</code>
                      </div>
                    </div>
                    <div className="relative group">
                      <pre className="text-xs text-slate-300 bg-black/30 rounded-xl p-4 overflow-x-auto leading-relaxed font-mono border border-white/6">
                        {doc.examples[(expandedExample[i] ?? 0)]?.body}
                      </pre>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton text={doc.examples[(expandedExample[i] ?? 0)]?.body ?? ''} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Response</p>
                    <pre className="text-xs text-emerald-300/80 bg-black/30 rounded-xl p-4 overflow-x-auto font-mono border border-white/6">
                      {doc.response}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Zapier / Pabbly Guide */}
      <div className="glass-card p-5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-200">Zapier / Pabbly Setup Guide</h2>
        </div>

        <div className="space-y-3 text-xs text-slate-400">
          <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-2">
            <p className="font-semibold text-slate-300">→ Zapier / Pabbly pushes leads IN (most common)</p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
              <li>Create a Zap with your trigger (e.g. "New row in Google Sheet", "New Facebook Lead Ad")</li>
              <li>Add a <span className="text-slate-200">Webhooks by Zapier</span> action → <span className="text-slate-200">POST</span></li>
              <li>URL: <code className="text-indigo-300 bg-indigo-500/8 px-1.5 py-0.5 rounded">{baseUrl}/api/webhooks/leads</code></li>
              <li>Header: <code className="text-indigo-300 bg-indigo-500/8 px-1.5 py-0.5 rounded">x-api-key</code> → your API key</li>
              <li>Body: map <code className="text-slate-300">batchId</code> (or <code className="text-slate-300">programId + levelId</code>), <code className="text-slate-300">name</code>, <code className="text-slate-300">email</code>, <code className="text-slate-300">phone</code></li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-2">
            <p className="font-semibold text-slate-300">→ Dashboard pushes data OUT to Zapier/Pabbly</p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
              <li>In Zapier: create a Zap with trigger <span className="text-slate-200">Webhooks by Zapier → Catch Hook</span></li>
              <li>Copy the generated webhook URL from Zapier</li>
              <li>Paste it in the <span className="text-slate-200">Outbound Webhooks</span> section below, select events</li>
              <li>The dashboard will POST to your Zapier URL automatically when those events fire</li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-white/3 border border-white/8">
            <p className="font-semibold text-slate-300 mb-1">→ Tip: Discover IDs dynamically in Zapier</p>
            <p>Use the <span className="text-slate-200">Info endpoint</span> (<code className="text-indigo-300 bg-indigo-500/8 px-1.5 py-0.5 rounded">GET /api/webhooks/info?resource=programs</code>) in a Zapier Code step to look up programId / levelId / batchId by name so your Zap stays flexible.</p>
          </div>
        </div>
      </div>

      {/* Outbound Webhooks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <ExternalLink size={16} className="text-indigo-400" /> Outbound — Dashboard → Zapier/Pabbly
          </h2>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Webhook
          </Button>
        </div>

        {webhooks.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
              <Webhook size={22} className="text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm font-medium">No outbound webhooks yet</p>
            <p className="text-slate-600 text-xs">Add a Zapier or Pabbly "Catch Hook" URL to push events out.</p>
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
                      className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-500/10 text-xs"
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
        <WebhookFormModal onClose={() => setShowAdd(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Webhook" solid>
        {editing && <WebhookFormModal initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
