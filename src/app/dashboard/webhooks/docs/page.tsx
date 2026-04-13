'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Copy, CheckCircle2, ArrowUpRight, ExternalLink,
  Zap, Info, AlertTriangle, Key, Send, Download, Search,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="p-1 text-slate-500 hover:text-slate-200 transition-colors rounded"
      title="Copy"
    >
      {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Code Block ───────────────────────────────────────────────────────────────
function CodeBlock({ children, copyText }: { children: string; copyText?: string }) {
  return (
    <div className="relative group">
      <pre className="text-xs text-slate-300 bg-black/40 rounded-xl p-4 overflow-x-auto leading-relaxed font-mono border border-white/6">
        {children}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyBtn text={copyText ?? children} />
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Endpoint Card ────────────────────────────────────────────────────────────
function EndpointCard({
  method, path, title, description, bodyExamples, queryExamples, response, notes,
}: {
  method: string;
  path: string;
  title: string;
  description: string;
  bodyExamples?: { label: string; body: string }[];
  queryExamples?: { label: string; query: string }[];
  response: string;
  notes?: string;
}) {
  const [tab, setTab] = useState(0);
  const examples = bodyExamples ?? queryExamples ?? [];
  const methodColor = method === 'POST' ? 'text-green-400 bg-green-500/10' : 'text-sky-400 bg-sky-500/10';

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4 border border-white/8">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${methodColor} border border-current/20`}>{method}</span>
        <code className="text-sm text-slate-200 font-mono">{path}</code>
        <span className="text-xs text-slate-500 ml-auto">{title}</span>
      </div>

      <p className="text-xs text-slate-400">{description}</p>

      {/* URL */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">Full URL:</span>
        <code className="text-indigo-300 font-mono flex-1 truncate">{baseUrl}{path}</code>
        <CopyBtn text={`${baseUrl}${path}`} />
      </div>

      {/* Examples */}
      {examples.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {examples.map((ex, i) => (
            <button
              key={i}
              onClick={() => setTab(i)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${tab === i ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-white/8 bg-white/3 text-slate-400 hover:text-slate-200'}`}
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}

      {examples.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {bodyExamples ? 'Request Body (JSON)' : 'Query Parameters'} — {examples[tab]?.label}
          </p>
          <CodeBlock copyText={bodyExamples ? (examples[tab] as { body: string })?.body : `${baseUrl}${path}${(examples[tab] as { query: string })?.query}`}>
            {bodyExamples ? (examples[tab] as { body: string })?.body : (examples[tab] as { query: string })?.query}
          </CodeBlock>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Response</p>
        <CodeBlock>{response}</CodeBlock>
      </div>

      {notes && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-amber-300/80">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{notes}</span>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function WebhookDocsPage() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20">
      {/* Back Link */}
      <Link
        href="/dashboard/webhooks"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Webhooks
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text mb-1">API Documentation</h1>
        <p className="text-slate-500 text-sm">Everything your team needs to integrate with Zapier, Pabbly, or any HTTP tool.</p>
      </div>

      {/* Table of Contents */}
      <nav className="glass-card p-4 rounded-2xl">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">On this page</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <a href="#auth" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Key size={11} /> Authentication
          </a>
          <a href="#find-ids" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Search size={11} /> Finding IDs
          </a>
          <a href="#add-lead" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Send size={11} /> Add Lead
          </a>
          <a href="#create-batch" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Send size={11} /> Create Batch
          </a>
          <a href="#lookup" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Search size={11} /> Look Up IDs (API)
          </a>
          <a href="#get-leads" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Download size={11} /> Get Leads
          </a>
          <a href="#outbound" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <ExternalLink size={11} /> Outbound Webhooks
          </a>
          <a href="#zapier" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            <Zap size={11} /> Zapier / Pabbly Guide
          </a>
        </div>
      </nav>

      {/* Authentication */}
      <Section id="auth" icon={<Key size={16} className="text-indigo-400" />} title="Authentication">
        <div className="glass-card p-5 rounded-2xl space-y-4">
          <p className="text-xs text-slate-400">
            All API calls require the header <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded">x-api-key</code> with your secret key.
          </p>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Setup</p>
            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1.5">
              <li>Go to <span className="text-slate-200">Vercel → Project Settings → Environment Variables</span></li>
              <li>Add variable: <code className="text-indigo-300 bg-indigo-500/10 px-1 py-0.5 rounded">WEBHOOK_API_KEY</code></li>
              <li>Set it to your API key (a 64-character random string)</li>
              <li><span className="text-amber-400 font-medium">Redeploy your project</span> for the change to take effect</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Usage</p>
            <CodeBlock>{`Headers:
  Content-Type: application/json
  x-api-key: YOUR_API_KEY_HERE`}</CodeBlock>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-amber-300/80">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <span>After adding or changing environment variables in Vercel, you <strong>must redeploy</strong>. The old deployment won't pick up the new values.</span>
          </div>
        </div>
      </Section>

      {/* Finding IDs */}
      <Section id="find-ids" icon={<Search size={16} className="text-amber-400" />} title="Finding Program / Level / Batch IDs">
        <div className="glass-card p-5 rounded-2xl space-y-4">
          <p className="text-xs text-slate-400">
            You need IDs to send data to the correct program/level/batch. Two ways to find them:
          </p>

          <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-2">
            <p className="text-xs font-semibold text-slate-300">Option 1: From the Dashboard (easiest)</p>
            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1.5">
              <li>Go to <Link href="/dashboard/master/programs" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Master → Programs</Link></li>
              <li>Click the <span className="text-slate-200">📋 copy icon</span> next to any program to copy its <strong>Program ID</strong></li>
              <li>Click into a program → click the 📋 copy icon next to a level for the <strong>Level ID</strong></li>
              <li>Click into a level → click the 📋 copy icon next to a batch for the <strong>Batch ID</strong></li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-2">
            <p className="text-xs font-semibold text-slate-300">Option 2: Via the API</p>
            <p className="text-xs text-slate-400">
              Use the <code className="text-indigo-300 bg-indigo-500/10 px-1 py-0.5 rounded">GET /api/webhooks/info</code> endpoint (see below) to look up IDs by name.
            </p>
          </div>
        </div>
      </Section>

      {/* Add Lead */}
      <Section id="add-lead" icon={<ArrowUpRight size={16} className="text-emerald-400" />} title="Add Lead to Batch">
        <EndpointCard
          method="POST"
          path="/api/webhooks/leads"
          title="Create a lead"
          description="Add a lead to a batch. You can reference the batch directly by ID, or by program + level (it'll use the latest batch)."
          bodyExamples={[
            { label: 'By Batch ID', body: JSON.stringify({ batchId: 'PASTE_BATCH_ID', name: 'Jane Doe', email: 'jane@example.com', phone: '+91 9876543210' }, null, 2) },
            { label: 'By Program + Level', body: JSON.stringify({ programId: 'PASTE_PROGRAM_ID', levelId: 'PASTE_LEVEL_ID', name: 'Jane Doe', email: 'jane@example.com', phone: '+91 9876543210' }, null, 2) },
            { label: 'With Batch Number', body: JSON.stringify({ programId: 'PASTE_PROGRAM_ID', levelId: 'PASTE_LEVEL_ID', batchNumber: '001', name: 'Jane Doe', email: 'jane@example.com', phone: '+91 9876543210' }, null, 2) },
          ]}
          response={JSON.stringify({ success: true, leadId: 'abc123', batchId: 'xyz789', serialNumber: 42 }, null, 2)}
          notes="If a lead with the same email already exists in the batch, it won't create a duplicate."
        />
      </Section>

      {/* Create Batch */}
      <Section id="create-batch" icon={<ArrowUpRight size={16} className="text-indigo-400" />} title="Create a Batch">
        <EndpointCard
          method="POST"
          path="/api/webhooks/batches"
          title="Create batch"
          description="Create a new batch inside a program level."
          bodyExamples={[
            { label: 'Create Batch', body: JSON.stringify({ programId: 'PASTE_PROGRAM_ID', levelId: 'PASTE_LEVEL_ID', batchNumber: '001', batchName: 'Batch Alpha' }, null, 2) },
          ]}
          response={JSON.stringify({ success: true, batchId: 'newBatchId123' }, null, 2)}
        />
      </Section>

      {/* Look Up IDs */}
      <Section id="lookup" icon={<Search size={16} className="text-amber-400" />} title="Look Up IDs via API">
        <EndpointCard
          method="GET"
          path="/api/webhooks/info"
          title="Resolve names → IDs"
          description="Query this endpoint to discover program, level, and batch IDs by name. Useful in Zapier Code steps."
          queryExamples={[
            { label: 'List Programs', query: '?resource=programs' },
            { label: 'List Levels', query: '?resource=levels&programId=PROGRAM_ID' },
            { label: 'List Batches', query: '?resource=batches&levelId=LEVEL_ID' },
          ]}
          response={JSON.stringify({ items: [{ id: 'abc123', name: 'Level 0 – Intro', order: 0 }] }, null, 2)}
        />
      </Section>

      {/* Get Leads */}
      <Section id="get-leads" icon={<Download size={16} className="text-sky-400" />} title="Get Leads from Batch">
        <EndpointCard
          method="GET"
          path="/api/webhooks/leads"
          title="Export leads"
          description="Retrieve all leads from a batch."
          queryExamples={[
            { label: 'By Batch ID', query: '?batchId=PASTE_BATCH_ID' },
          ]}
          response={JSON.stringify({ leads: [{ id: '…', name: 'Jane', email: 'jane@example.com', phone: '+91 98765', serialNumber: 1 }], count: 1 }, null, 2)}
        />
      </Section>

      {/* Outbound Webhooks */}
      <Section id="outbound" icon={<ExternalLink size={16} className="text-purple-400" />} title="Outbound Webhooks">
        <div className="glass-card p-5 rounded-2xl space-y-4">
          <p className="text-xs text-slate-400">
            Outbound webhooks send a POST request to your URL whenever certain events happen in the dashboard.
          </p>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Available Events</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-xs">
                <p className="text-emerald-400 font-semibold mb-1">lead_created</p>
                <p className="text-slate-500">When a lead is added via API</p>
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15 text-xs">
                <p className="text-indigo-400 font-semibold mb-1">batch_created</p>
                <p className="text-slate-500">When a batch is created via API</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs">
                <p className="text-amber-400 font-semibold mb-1">lead_updated</p>
                <p className="text-slate-500">When a lead is updated via API</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Payload Format</p>
            <CodeBlock>{JSON.stringify({
              event: 'lead_created',
              timestamp: '2026-04-13T12:00:00.000Z',
              data: { leadId: 'abc123', name: 'Jane Doe', email: 'jane@example.com', batchId: 'xyz789' },
            }, null, 2)}</CodeBlock>
          </div>

          <p className="text-xs text-slate-500">
            Manage your outbound webhooks from the{' '}
            <Link href="/dashboard/webhooks" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
              Webhooks page
            </Link>.
          </p>
        </div>
      </Section>

      {/* Zapier / Pabbly Guide */}
      <Section id="zapier" icon={<Zap size={16} className="text-amber-400" />} title="Zapier / Pabbly Step-by-Step Guide">
        <div className="space-y-4">
          {/* Inbound */}
          <div className="glass-card p-5 rounded-2xl space-y-3">
            <p className="text-sm font-semibold text-slate-200">Pushing leads IN (Zapier/Pabbly → Dashboard)</p>
            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2">
              <li>
                <span className="text-slate-300">Create your trigger</span> — e.g. &quot;New Facebook Lead Ad&quot;, &quot;New row in Google Sheet&quot;, etc.
              </li>
              <li>
                <span className="text-slate-300">Add an action:</span> &quot;Webhooks by Zapier&quot; → POST (or Pabbly → API / Webhook → POST)
              </li>
              <li>
                <span className="text-slate-300">URL:</span>
                <div className="mt-1.5 flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/6 font-mono text-xs text-indigo-300">
                  <span className="flex-1 truncate">{baseUrl}/api/webhooks/leads</span>
                  <CopyBtn text={`${baseUrl}/api/webhooks/leads`} />
                </div>
              </li>
              <li>
                <span className="text-slate-300">Headers:</span>
                <div className="mt-1.5">
                  <CodeBlock>{`Content-Type: application/json
x-api-key: YOUR_API_KEY_HERE`}</CodeBlock>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">In Pabbly: add headers as key-value pairs in the &quot;Header&quot; section.</p>
              </li>
              <li>
                <span className="text-slate-300">Body (JSON):</span> Map your trigger fields:
                <div className="mt-1.5">
                  <CodeBlock>{JSON.stringify({
                    programId: '{{paste your Program ID}}',
                    levelId: '{{paste your Level ID}}',
                    name: '{{trigger.name}}',
                    email: '{{trigger.email}}',
                    phone: '{{trigger.phone}}',
                  }, null, 2)}</CodeBlock>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">
                  Get the Program ID and Level ID from <Link href="/dashboard/master/programs" className="text-indigo-400 underline underline-offset-2">Master → Programs</Link> (click the 📋 copy icon).
                  Or use <code className="text-indigo-300">batchId</code> directly if you want a specific batch.
                </p>
              </li>
              <li><span className="text-slate-300">Test the step</span> and check your dashboard for the new lead.</li>
            </ol>
          </div>

          {/* Outbound */}
          <div className="glass-card p-5 rounded-2xl space-y-3">
            <p className="text-sm font-semibold text-slate-200">Pushing data OUT (Dashboard → Zapier/Pabbly)</p>
            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2">
              <li>In Zapier: create a Zap with trigger <span className="text-slate-200">&quot;Webhooks by Zapier → Catch Hook&quot;</span></li>
              <li>Zapier gives you a unique URL — <span className="text-slate-200">copy it</span></li>
              <li>Go to <Link href="/dashboard/webhooks" className="text-indigo-400 underline underline-offset-2">Webhooks page</Link> → <span className="text-slate-200">Add Webhook</span></li>
              <li>Paste the URL, select events (e.g. lead_created), save</li>
              <li>Click the ⚡ test button to send a sample payload to Zapier</li>
              <li>Back in Zapier, click &quot;Test Trigger&quot; to confirm it received the data</li>
              <li>Add your Zapier actions (e.g. add row to Google Sheet, send Slack message, etc.)</li>
            </ol>
          </div>

          {/* Troubleshooting */}
          <div className="glass-card p-5 rounded-2xl space-y-3">
            <p className="text-sm font-semibold text-slate-200">Troubleshooting</p>
            <div className="space-y-2.5 text-xs text-slate-400">
              <div className="p-3 rounded-xl bg-white/3 border border-white/8">
                <p className="text-slate-300 font-medium mb-1">Getting &quot;Unauthorized&quot;?</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Check your <code className="text-indigo-300">x-api-key</code> header matches the <code className="text-indigo-300">WEBHOOK_API_KEY</code> in Vercel env vars exactly</li>
                  <li>Make sure you <strong>redeployed</strong> after adding the env var</li>
                  <li>No quotes, no spaces around the key value in Vercel</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/8">
                <p className="text-slate-300 font-medium mb-1">Getting &quot;Internal Server Error&quot;?</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Check that <code className="text-indigo-300">FIREBASE_ADMIN_PROJECT_ID</code>, <code className="text-indigo-300">FIREBASE_ADMIN_CLIENT_EMAIL</code>, and <code className="text-indigo-300">FIREBASE_ADMIN_PRIVATE_KEY</code> are set in Vercel</li>
                  <li>For the private key: copy the entire key including <code className="text-slate-300">-----BEGIN PRIVATE KEY-----</code> and <code className="text-slate-300">-----END PRIVATE KEY-----</code></li>
                  <li>Redeploy after adding env vars</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/8">
                <p className="text-slate-300 font-medium mb-1">Getting &quot;Batch not found&quot;?</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Make sure you&apos;re using the correct ID — copy it from the dashboard using the 📋 icon</li>
                  <li>If using <code className="text-indigo-300">programId + levelId</code>, at least one batch must exist in that level</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
