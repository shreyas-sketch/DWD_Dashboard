'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  TrendingUp, Flame, Users, Search, ChevronDown, ChevronUp,
  ArrowRight, Filter, BarChart2, Target, Sparkles, Phone,
  CheckCircle2, XCircle, AlertTriangle, Trophy, DollarSign,
  ExternalLink, ChevronsUp, Eye, RefreshCw, Download,
} from 'lucide-react';
import {
  collection, getDocs, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/usePrograms';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type {
  Program, Level, Batch, Lead, LeadTag,
  CallSession, LeadCallReport, CallSessionType,
} from '@/types';
import Papa from 'papaparse';

// ─── Scoring Constants ────────────────────────────────────────────────────────
const WEIGHTS = {
  registration: 5,          // per registered main session
  callingAssistPositive: 3, // "Will Attend/Will join" or "Message Sent"
  handlerJoined: 8,         // "JOINED" for a main call
  handlerWillAttend: 4,     // "Will Attend/Will join" on handler
  doubtSessionAttended: 6,  // attended a doubt session
  deposit: 20,              // deposit tag per level
  won: 35,                  // won tag per level
  levelProgression: 15,     // present in a higher level at all
  negativeDropped: -3,      // "Dropped from call"
  negativeNotActive: -2,    // "Not Active"
  negativeWontAttend: -5,   // "Won't Attend-NR" / "Don't Call Them"
};

const HANDLER_JOINED_STATES = new Set(['JOINED', 'Will Attend/Will join']);
const HANDLER_DROPPED = new Set(['Dropped from call']);
const HANDLER_NOT_ACTIVE = new Set(['Not Active']);
const HANDLER_NEGATIVE = new Set(["Won't Attend-NR", "Don't Call Them"]);
const CA_POSITIVE = new Set(['Will Attend/Will join', 'Message Sent']);

// ─── Types ────────────────────────────────────────────────────────────────────
interface LevelData {
  level: Level;
  batches: Batch[];
  leads: Lead[];
  sessions: CallSession[];
  reports: LeadCallReport[];
}

interface ScoredLead {
  // Identity
  email: string;
  name: string;
  phone: string;
  // Score breakdown
  totalScore: number;
  maxPossibleScore: number;
  warmthPct: number;
  warmthLabel: string;
  warmthColor: string;
  // Signals per level
  levelSignals: LevelSignal[];
  // Tags summary
  hasDeposit: boolean;
  hasWon: boolean;
  depositLevels: string[];
  wonLevels: string[];
  // Attendance
  totalMainSessions: number;
  joinedMainSessions: number;
  attendancePct: number;
  // Cross-program
  otherPrograms: { programId: string; programName: string; levelNames: string[] }[];
  // Raw leads (for drill-down)
  leadRecords: Lead[];
}

interface LevelSignal {
  levelId: string;
  levelName: string;
  levelOrder: number;
  registered: number;
  totalMainSessions: number;
  joined: number;
  doubtAttended: number;
  totalDoubtSessions: number;
  hasDeposit: boolean;
  hasWon: boolean;
  score: number;
}

// ─── Warmth Classification ────────────────────────────────────────────────────
function classifyWarmth(pct: number): { label: string; color: string; bg: string; border: string } {
  if (pct >= 80) return { label: 'Hot 🔥', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' };
  if (pct >= 60) return { label: 'Warm', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
  if (pct >= 40) return { label: 'Lukewarm', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  if (pct >= 20) return { label: 'Cool', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' };
  return { label: 'Cold', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
}

function closingChance(pct: number): string {
  if (pct >= 80) return 'Very High';
  if (pct >= 60) return 'High';
  if (pct >= 40) return 'Medium';
  if (pct >= 20) return 'Low';
  return 'Very Low';
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────
function scoreLead(
  email: string,
  leadsByEmail: Lead[],
  levelDataMap: Map<string, LevelData>,
  levels: Level[],
  allLeadsByEmail: Map<string, { programId: string; programName: string; levelNames: string[] }[]>,
): ScoredLead {
  const name = leadsByEmail[0]?.name ?? '';
  const phone = leadsByEmail[0]?.phone ?? '';

  let totalScore = 0;
  let maxPossible = 0;
  const levelSignals: LevelSignal[] = [];

  let totalMainSessions = 0;
  let joinedMainSessions = 0;
  const depositLevelNames: string[] = [];
  const wonLevelNames: string[] = [];

  // Process each level the lead is in
  const sortedLevels = [...levels].sort((a, b) => a.order - b.order);

  for (const level of sortedLevels) {
    const ld = levelDataMap.get(level.id);
    if (!ld) continue;

    // Find leads for this email in this level
    const leadsInLevel = leadsByEmail.filter((l) => l.levelId === level.id);
    if (leadsInLevel.length === 0) continue;

    const leadIdsArr = leadsInLevel.map((l) => l.id);
    const leadIds = new Set(leadIdsArr);
    const mainSessions = ld.sessions.filter((s) => !s.sessionType || s.sessionType === 'main');
    const doubtSessions = ld.sessions.filter((s) => s.sessionType === 'doubt1' || s.sessionType === 'doubt2');
    const relevantReports = ld.reports.filter((r) => leadIds.has(r.leadId));

    // Build report lookup: leadId_sessionId => report
    const reportMap = new Map<string, LeadCallReport>();
    for (const r of relevantReports) {
      reportMap.set(`${r.leadId}_${r.callSessionId}`, r);
    }

    let registered = 0;
    let joined = 0;
    let caPositive = 0;
    let dropped = 0;
    let notActive = 0;
    let negative = 0;
    let doubtAttended = 0;

    // Score main sessions
    for (const session of mainSessions) {
      let sessionJoined = false;
      for (const leadId of leadIdsArr) {
        const report = reportMap.get(`${leadId}_${session.id}`);
        if (!report) continue;

        if (report.registrationReport === 'Registered') registered++;
        if (report.callingAssistReport && CA_POSITIVE.has(report.callingAssistReport)) caPositive++;
        if (report.handlerReport && HANDLER_JOINED_STATES.has(report.handlerReport)) { joined++; sessionJoined = true; }
        if (report.handlerReport && HANDLER_DROPPED.has(report.handlerReport)) { dropped++; sessionJoined = true; }
        if (report.handlerReport && HANDLER_NOT_ACTIVE.has(report.handlerReport)) { notActive++; sessionJoined = true; }
        if (report.handlerReport && HANDLER_NEGATIVE.has(report.handlerReport)) negative++;
      }
    }

    // Score doubt sessions
    for (const session of doubtSessions) {
      for (const leadId of leadIdsArr) {
        const report = reportMap.get(`${leadId}_${session.id}`);
        if (report?.handlerReport && HANDLER_JOINED_STATES.has(report.handlerReport)) doubtAttended++;
      }
    }

    // Tags
    const allTags: LeadTag[] = leadsInLevel.flatMap((l) => l.tags ?? []);
    const hasDeposit = allTags.some((t) => t.type === 'deposit' && t.levelId === level.id);
    const hasWon = allTags.some((t) => t.type === 'won' && t.levelId === level.id);
    if (hasDeposit) depositLevelNames.push(level.name);
    if (hasWon) wonLevelNames.push(level.name);

    // Calculate level score
    let levelScore = 0;
    levelScore += registered * WEIGHTS.registration;
    levelScore += caPositive * WEIGHTS.callingAssistPositive;
    levelScore += joined * WEIGHTS.handlerJoined;
    levelScore += doubtAttended * WEIGHTS.doubtSessionAttended;
    levelScore += hasDeposit ? WEIGHTS.deposit : 0;
    levelScore += hasWon ? WEIGHTS.won : 0;
    if (level.order > 0) levelScore += WEIGHTS.levelProgression;
    levelScore += dropped * WEIGHTS.negativeDropped;
    levelScore += notActive * WEIGHTS.negativeNotActive;
    levelScore += negative * WEIGHTS.negativeWontAttend;
    levelScore = Math.max(0, levelScore);

    // Max possible for this level
    let levelMax = mainSessions.length * (WEIGHTS.registration + WEIGHTS.callingAssistPositive + WEIGHTS.handlerJoined);
    levelMax += doubtSessions.length * WEIGHTS.doubtSessionAttended;
    levelMax += WEIGHTS.deposit + WEIGHTS.won;
    if (level.order > 0) levelMax += WEIGHTS.levelProgression;

    totalScore += levelScore;
    maxPossible += levelMax;
    totalMainSessions += mainSessions.length;
    joinedMainSessions += joined;

    levelSignals.push({
      levelId: level.id,
      levelName: level.name,
      levelOrder: level.order,
      registered,
      totalMainSessions: mainSessions.length,
      joined,
      doubtAttended,
      totalDoubtSessions: doubtSessions.length,
      hasDeposit,
      hasWon,
      score: levelScore,
    });
  }

  const warmthPct = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
  const w = classifyWarmth(warmthPct);
  const attendancePct = totalMainSessions > 0 ? Math.round((joinedMainSessions / totalMainSessions) * 100) : 0;

  // Cross-program
  const otherPrograms = allLeadsByEmail.get(email.toLowerCase()) ?? [];

  return {
    email,
    name,
    phone,
    totalScore,
    maxPossibleScore: maxPossible,
    warmthPct,
    warmthLabel: w.label,
    warmthColor: w.color,
    levelSignals,
    hasDeposit: depositLevelNames.length > 0,
    hasWon: wonLevelNames.length > 0,
    depositLevels: depositLevelNames,
    wonLevels: wonLevelNames,
    totalMainSessions,
    joinedMainSessions,
    attendancePct,
    otherPrograms,
    leadRecords: leadsByEmail,
  };
}

// ─── Warmth Bar Component ─────────────────────────────────────────────────────
function WarmthBar({ pct }: { pct: number }) {
  const w = classifyWarmth(pct);
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct >= 80 ? 'bg-gradient-to-r from-orange-500 to-red-500' : pct >= 60 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : pct >= 40 ? 'bg-gradient-to-r from-yellow-500 to-amber-500' : pct >= 20 ? 'bg-gradient-to-r from-sky-500 to-blue-500' : 'bg-slate-600'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Lead Detail Modal ────────────────────────────────────────────────────────
function LeadDetailModal({ lead, programName, onClose }: { lead: ScoredLead; programName: string; onClose: () => void }) {
  const w = classifyWarmth(lead.warmthPct);

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
          {lead.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-200 truncate">{lead.name}</h3>
          <p className="text-xs text-slate-500 truncate">{lead.email} · {lead.phone}</p>
        </div>
        <div className={`text-right flex-shrink-0`}>
          <p className={`text-2xl font-bold ${w.color}`}>{lead.warmthPct}%</p>
          <p className={`text-xs font-medium ${w.color}`}>{lead.warmthLabel}</p>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
          <p className="text-lg font-bold text-slate-200">{lead.totalScore}</p>
          <p className="text-[10px] text-slate-500 font-medium">TOTAL SCORE</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
          <p className="text-lg font-bold text-slate-200">{lead.attendancePct}%</p>
          <p className="text-[10px] text-slate-500 font-medium">ATTENDANCE</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
          <p className={`text-lg font-bold ${lead.warmthPct >= 60 ? 'text-emerald-400' : lead.warmthPct >= 40 ? 'text-amber-400' : 'text-slate-400'}`}>
            {closingChance(lead.warmthPct)}
          </p>
          <p className="text-[10px] text-slate-500 font-medium">CLOSING CHANCE</p>
        </div>
      </div>

      <WarmthBar pct={lead.warmthPct} />

      {/* Level-by-Level Breakdown */}
      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Level-by-Level Journey</h4>
        <div className="space-y-3">
          {lead.levelSignals.map((ls, idx) => (
            <div key={ls.levelId} className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {idx > 0 && <ChevronsUp size={12} className="text-indigo-400" />}
                  <span className="text-sm font-semibold text-slate-200">{ls.levelName}</span>
                </div>
                <span className="text-xs font-mono text-slate-500">+{ls.score} pts</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                  <span>Registered: <span className="text-slate-200 font-medium">{ls.registered}/{ls.totalMainSessions}</span></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Phone size={12} className="text-indigo-400 flex-shrink-0" />
                  <span>Joined: <span className="text-slate-200 font-medium">{ls.joined}/{ls.totalMainSessions}</span></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Users size={12} className="text-purple-400 flex-shrink-0" />
                  <span>Doubt: <span className="text-slate-200 font-medium">{ls.doubtAttended}/{ls.totalDoubtSessions}</span></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  {ls.hasWon ? (
                    <><Trophy size={12} className="text-emerald-400 flex-shrink-0" /><span className="text-emerald-400 font-semibold">Won ✓</span></>
                  ) : ls.hasDeposit ? (
                    <><DollarSign size={12} className="text-amber-400 flex-shrink-0" /><span className="text-amber-400 font-semibold">Deposit ✓</span></>
                  ) : (
                    <><XCircle size={12} className="text-slate-600 flex-shrink-0" /><span>No tag</span></>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tags Summary */}
      {(lead.depositLevels.length > 0 || lead.wonLevels.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {lead.wonLevels.map((ln) => (
            <span key={`won-${ln}`} className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">
              <Trophy size={10} className="inline mr-1" />Won — {ln}
            </span>
          ))}
          {lead.depositLevels.map((ln) => (
            <span key={`dep-${ln}`} className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
              <DollarSign size={10} className="inline mr-1" />Deposit — {ln}
            </span>
          ))}
        </div>
      )}

      {/* Cross-Program Utilization */}
      {lead.otherPrograms.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Cross-Program Presence</h4>
          <div className="space-y-2">
            {lead.otherPrograms.map((op) => (
              <div key={op.programId} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/8 bg-white/3 text-xs">
                <Sparkles size={12} className="text-purple-400 flex-shrink-0" />
                <span className="text-slate-200 font-medium flex-1">{op.programName}</span>
                <span className="text-slate-500">{op.levelNames.join(', ')}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            This lead is already in other programs — high cross-sell potential.
          </p>
        </div>
      )}

      {/* Recommendation */}
      <div className={`rounded-xl border p-4 ${w.bg} ${w.border}`}>
        <div className="flex items-start gap-2">
          <Target size={14} className={`${w.color} mt-0.5 flex-shrink-0`} />
          <div>
            <p className={`text-xs font-semibold ${w.color} mb-1`}>Recommendation</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {lead.warmthPct >= 80 ? (
                'This lead is extremely warm — they are highly engaged and likely to convert. Prioritize follow-up immediately. Consider offering a limited-time incentive to close.'
              ) : lead.warmthPct >= 60 ? (
                'Strong engagement signals. This lead is actively participating. A personal call from the handler or a direct offer can push them to close.'
              ) : lead.warmthPct >= 40 ? (
                'Moderate interest — the lead has shown some commitment but is not fully engaged. Re-engage with targeted follow-up calls and highlight value propositions.'
              ) : lead.warmthPct >= 20 ? (
                'Low engagement. The lead registered but has limited participation. Consider adding them to a nurture sequence or re-engaging through a different channel.'
              ) : (
                'Minimal signals. This lead may not be the right fit or may have lost interest. Consider low-investment outreach or archiving.'
              )}
              {lead.otherPrograms.length > 0 && ` Since they're also in ${lead.otherPrograms.map((o) => o.programName).join(' & ')}, cross-sell messaging may resonate.`}
            </p>
          </div>
        </div>
      </div>

      <Button variant="secondary" className="w-full" onClick={onClose}>Close</Button>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function UtilizeLeadPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [loading, setLoading] = useState(false);
  const [scoredLeads, setScoredLeads] = useState<ScoredLead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'warmth' | 'score' | 'attendance' | 'name'>('warmth');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [filterWarmth, setFilterWarmth] = useState<string>('all');
  const [detailLead, setDetailLead] = useState<ScoredLead | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────────
  const loadAndScore = useCallback(async (programId: string) => {
    if (!programId) return;
    setLoading(true);
    setHasLoaded(false);

    try {
      // 1. Fetch levels for this program
      const levelsSnap = await getDocs(
        query(collection(db, 'levels'), where('programId', '==', programId), orderBy('order', 'asc')),
      );
      const levels = levelsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Level));

      if (levels.length === 0) {
        setScoredLeads([]);
        setHasLoaded(true);
        setLoading(false);
        return;
      }

      // 2. Fetch all batches, leads, sessions, reports per level
      const levelDataMap = new Map<string, LevelData>();
      const allLeads: Lead[] = [];

      for (const level of levels) {
        const [batchesSnap, leadsSnap, sessionsSnap] = await Promise.all([
          getDocs(query(collection(db, 'batches'), where('levelId', '==', level.id))),
          getDocs(query(collection(db, 'leads'), where('levelId', '==', level.id))),
          getDocs(query(collection(db, 'callSessions'), where('levelId', '==', level.id))),
        ]);

        const batches = batchesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Batch));
        const leads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
        const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession));

        // Fetch reports per batch (Firestore 'in' limited to 30)
        const batchIds = batches.map((b) => b.id);
        let reports: LeadCallReport[] = [];
        for (let i = 0; i < batchIds.length; i += 30) {
          const chunk = batchIds.slice(i, i + 30);
          if (chunk.length === 0) continue;
          const reportsSnap = await getDocs(
            query(collection(db, 'callReports'), where('batchId', 'in', chunk)),
          );
          reports.push(...reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadCallReport)));
        }

        levelDataMap.set(level.id, { level, batches, leads, sessions, reports });
        allLeads.push(...leads);
      }

      // 3. Build cross-program map: email → other programs
      const programName = programs.find((p) => p.id === programId)?.name ?? '';
      const allEmails = new Set(allLeads.map((l) => l.email?.toLowerCase()).filter(Boolean));

      // Fetch leads from OTHER programs that share any email
      const allLeadsByEmail = new Map<string, { programId: string; programName: string; levelNames: string[] }[]>();

      if (allEmails.size > 0) {
        const otherPrograms = programs.filter((p) => p.id !== programId);
        for (const op of otherPrograms) {
          const opLevelsSnap = await getDocs(
            query(collection(db, 'levels'), where('programId', '==', op.id), orderBy('order', 'asc')),
          );
          const opLevels = opLevelsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Level));

          for (const opLevel of opLevels) {
            const opLeadsSnap = await getDocs(
              query(collection(db, 'leads'), where('levelId', '==', opLevel.id)),
            );
            for (const opLeadDoc of opLeadsSnap.docs) {
              const opEmail = (opLeadDoc.data().email ?? '').toLowerCase();
              if (opEmail && allEmails.has(opEmail)) {
                const existing = allLeadsByEmail.get(opEmail) ?? [];
                const entry = existing.find((e) => e.programId === op.id);
                if (entry) {
                  if (!entry.levelNames.includes(opLevel.name)) entry.levelNames.push(opLevel.name);
                } else {
                  existing.push({ programId: op.id, programName: op.name, levelNames: [opLevel.name] });
                }
                allLeadsByEmail.set(opEmail, existing);
              }
            }
          }
        }
      }

      // 4. Group leads by email and score
      const emailGroups = new Map<string, Lead[]>();
      for (const lead of allLeads) {
        const key = lead.email?.toLowerCase();
        if (!key) continue;
        const arr = emailGroups.get(key) ?? [];
        arr.push(lead);
        emailGroups.set(key, arr);
      }

      const scored: ScoredLead[] = [];
      Array.from(emailGroups.entries()).forEach(([email, leadGroup]) => {
        scored.push(scoreLead(email, leadGroup, levelDataMap, levels, allLeadsByEmail));
      });

      // Sort by warmth desc by default
      scored.sort((a, b) => b.warmthPct - a.warmthPct);
      setScoredLeads(scored);
      setHasLoaded(true);
    } catch (err) {
      console.error('[UtilizeLead] scoring failed', err);
      toast.error('Failed to load lead data');
    } finally {
      setLoading(false);
    }
  }, [programs]);

  // ─── Filtered & Sorted ────────────────────────────────────────────────────────
  const displayLeads = useMemo(() => {
    let result = [...scoredLeads];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.phone.includes(q),
      );
    }

    // Warmth filter
    if (filterWarmth !== 'all') {
      result = result.filter((l) => {
        if (filterWarmth === 'hot') return l.warmthPct >= 80;
        if (filterWarmth === 'warm') return l.warmthPct >= 60 && l.warmthPct < 80;
        if (filterWarmth === 'lukewarm') return l.warmthPct >= 40 && l.warmthPct < 60;
        if (filterWarmth === 'cool') return l.warmthPct >= 20 && l.warmthPct < 40;
        if (filterWarmth === 'cold') return l.warmthPct < 20;
        if (filterWarmth === 'deposit') return l.hasDeposit;
        if (filterWarmth === 'won') return l.hasWon;
        if (filterWarmth === 'cross') return l.otherPrograms.length > 0;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'warmth') cmp = a.warmthPct - b.warmthPct;
      else if (sortBy === 'score') cmp = a.totalScore - b.totalScore;
      else if (sortBy === 'attendance') cmp = a.attendancePct - b.attendancePct;
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [scoredLeads, searchQuery, filterWarmth, sortBy, sortDir]);

  // ─── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (scoredLeads.length === 0) return null;
    const hot = scoredLeads.filter((l) => l.warmthPct >= 80).length;
    const warm = scoredLeads.filter((l) => l.warmthPct >= 60 && l.warmthPct < 80).length;
    const lukewarm = scoredLeads.filter((l) => l.warmthPct >= 40 && l.warmthPct < 60).length;
    const cool = scoredLeads.filter((l) => l.warmthPct >= 20 && l.warmthPct < 40).length;
    const cold = scoredLeads.filter((l) => l.warmthPct < 20).length;
    const avgWarmth = Math.round(scoredLeads.reduce((s, l) => s + l.warmthPct, 0) / scoredLeads.length);
    const withDeposit = scoredLeads.filter((l) => l.hasDeposit).length;
    const withWon = scoredLeads.filter((l) => l.hasWon).length;
    const crossProgram = scoredLeads.filter((l) => l.otherPrograms.length > 0).length;
    return { hot, warm, lukewarm, cool, cold, avgWarmth, withDeposit, withWon, crossProgram, total: scoredLeads.length };
  }, [scoredLeads]);

  function handleExport() {
    const rows = displayLeads.map((l) => ({
      Name: l.name,
      Email: l.email,
      Phone: l.phone,
      'Warmth %': l.warmthPct,
      'Warmth Label': l.warmthLabel,
      'Total Score': l.totalScore,
      'Attendance %': l.attendancePct,
      'Closing Chance': closingChance(l.warmthPct),
      'Deposit Levels': l.depositLevels.join(', '),
      'Won Levels': l.wonLevels.join(', '),
      'Levels Reached': l.levelSignals.length,
      'Other Programs': l.otherPrograms.map((o) => o.programName).join(', '),
    }));
    downloadCSV(Papa.unparse(rows), `lead-utilization-${selectedProgramId}.csv`);
    toast.success(`Exported ${rows.length} leads`);
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text mb-1">Utilize Lead</h1>
        <p className="text-slate-500 text-sm">Analyze lead warmth, potential, and closing chances across your programs.</p>
      </div>

      {/* Program Selector */}
      <div className="glass-card p-5 rounded-2xl">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Select
              label="Select Program"
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              placeholder="— Choose a program —"
              options={programs.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <Button
            onClick={() => loadAndScore(selectedProgramId)}
            disabled={!selectedProgramId || loading}
            loading={loading}
          >
            {loading ? 'Analyzing…' : <><BarChart2 size={14} /> Analyze Leads</>}
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button onClick={() => setFilterWarmth(filterWarmth === 'hot' ? 'all' : 'hot')} className={`glass-card p-4 rounded-2xl text-left transition-all ${filterWarmth === 'hot' ? 'ring-2 ring-red-500/40' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <Flame size={14} className="text-red-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Hot (80%+)</span>
            </div>
            <p className="text-xl font-bold text-red-400">{stats.hot}</p>
          </button>

          <button onClick={() => setFilterWarmth(filterWarmth === 'warm' ? 'all' : 'warm')} className={`glass-card p-4 rounded-2xl text-left transition-all ${filterWarmth === 'warm' ? 'ring-2 ring-orange-500/40' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-orange-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Warm (60-80)</span>
            </div>
            <p className="text-xl font-bold text-orange-400">{stats.warm}</p>
          </button>

          <button onClick={() => setFilterWarmth(filterWarmth === 'lukewarm' ? 'all' : 'lukewarm')} className={`glass-card p-4 rounded-2xl text-left transition-all ${filterWarmth === 'lukewarm' ? 'ring-2 ring-amber-500/40' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Lukewarm</span>
            </div>
            <p className="text-xl font-bold text-amber-400">{stats.lukewarm}</p>
          </button>

          <button onClick={() => setFilterWarmth(filterWarmth === 'deposit' ? 'all' : 'deposit')} className={`glass-card p-4 rounded-2xl text-left transition-all ${filterWarmth === 'deposit' ? 'ring-2 ring-amber-500/40' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className="text-amber-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Deposited</span>
            </div>
            <p className="text-xl font-bold text-amber-400">{stats.withDeposit}</p>
          </button>

          <button onClick={() => setFilterWarmth(filterWarmth === 'cross' ? 'all' : 'cross')} className={`glass-card p-4 rounded-2xl text-left transition-all ${filterWarmth === 'cross' ? 'ring-2 ring-purple-500/40' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} className="text-purple-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Cross-Program</span>
            </div>
            <p className="text-xl font-bold text-purple-400">{stats.crossProgram}</p>
          </button>
        </div>
      )}

      {/* Avg warmth bar */}
      {stats && (
        <div className="glass-card p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Average Lead Warmth</span>
            <span className={`text-sm font-bold ${classifyWarmth(stats.avgWarmth).color}`}>{stats.avgWarmth}%</span>
          </div>
          <WarmthBar pct={stats.avgWarmth} />
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-600">
            <span>{stats.total} total leads · {stats.withWon} won · {stats.withDeposit} deposited</span>
            <span>Avg closing chance: <span className="text-slate-400 font-medium">{closingChance(stats.avgWarmth)}</span></span>
          </div>
        </div>
      )}

      {/* Filters & Actions */}
      {hasLoaded && scoredLeads.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone…"
              className="input-glass pl-9 pr-3 py-2 text-sm w-full"
            />
          </div>
          <Select
            value={filterWarmth}
            onChange={(e) => setFilterWarmth(e.target.value)}
            options={[
              { value: 'all', label: 'All Leads' },
              { value: 'hot', label: '🔥 Hot (80%+)' },
              { value: 'warm', label: '🟠 Warm (60-80)' },
              { value: 'lukewarm', label: '🟡 Lukewarm (40-60)' },
              { value: 'cool', label: '🔵 Cool (20-40)' },
              { value: 'cold', label: '⚪ Cold (<20)' },
              { value: 'deposit', label: '💰 Has Deposit' },
              { value: 'won', label: '🏆 Won' },
              { value: 'cross', label: '✨ Cross-Program' },
            ]}
          />
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            options={[
              { value: 'warmth', label: 'Sort: Warmth' },
              { value: 'score', label: 'Sort: Score' },
              { value: 'attendance', label: 'Sort: Attendance' },
              { value: 'name', label: 'Sort: Name' },
            ]}
          />
          <button
            onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
            className="p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
            title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
          >
            {sortDir === 'desc' ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <Button size="sm" variant="secondary" onClick={handleExport}>
            <Download size={13} /> Export
          </Button>
        </div>
      )}

      {/* Lead Table */}
      {hasLoaded && (
        displayLeads.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <p className="text-slate-500 text-sm">{scoredLeads.length === 0 ? 'No leads found in this program.' : 'No leads match your filters.'}</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Lead</th>
                    <th className="text-left px-4 py-3 font-medium">Warmth</th>
                    <th className="text-center px-4 py-3 font-medium">Score</th>
                    <th className="text-center px-4 py-3 font-medium">Attendance</th>
                    <th className="text-center px-4 py-3 font-medium">Levels</th>
                    <th className="text-center px-4 py-3 font-medium">Tags</th>
                    <th className="text-center px-4 py-3 font-medium">Closing</th>
                    <th className="text-center px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {displayLeads.map((lead, idx) => {
                    const w = classifyWarmth(lead.warmthPct);
                    return (
                      <tr key={lead.email} className="hover:bg-white/2 transition-colors">
                        <td className="px-4 py-3 text-slate-600 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                              {lead.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-200 truncate max-w-[180px]">{lead.name}</p>
                              <p className="text-[11px] text-slate-500 truncate max-w-[180px]">{lead.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-28">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-semibold ${w.color}`}>{lead.warmthLabel}</span>
                              <span className={`text-[10px] font-mono ${w.color}`}>{lead.warmthPct}%</span>
                            </div>
                            <WarmthBar pct={lead.warmthPct} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-bold text-slate-200">{lead.totalScore}</span>
                          <span className="text-[10px] text-slate-600">/{lead.maxPossibleScore}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-semibold ${lead.attendancePct >= 70 ? 'text-emerald-400' : lead.attendancePct >= 40 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {lead.attendancePct}%
                          </span>
                          <p className="text-[10px] text-slate-600">{lead.joinedMainSessions}/{lead.totalMainSessions}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium text-slate-300">{lead.levelSignals.length}</span>
                          {lead.otherPrograms.length > 0 && (
                            <span className="text-[10px] text-purple-400 block">+{lead.otherPrograms.length} prog</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {lead.hasWon && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">Won</span>}
                            {lead.hasDeposit && !lead.hasWon && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">Deposit</span>}
                            {!lead.hasDeposit && !lead.hasWon && <span className="text-slate-600">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${lead.warmthPct >= 60 ? 'text-emerald-400' : lead.warmthPct >= 40 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {closingChance(lead.warmthPct)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setDetailLead(lead)}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-500/10"
                            title="View detailed analysis"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-white/8 text-xs text-slate-500 flex items-center justify-between">
              <span>Showing {displayLeads.length} of {scoredLeads.length} leads</span>
              {filterWarmth !== 'all' && (
                <button onClick={() => setFilterWarmth('all')} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  Clear filter
                </button>
              )}
            </div>
          </div>
        )
      )}

      {/* Scoring Legend */}
      {hasLoaded && scoredLeads.length > 0 && (
        <div className="glass-card p-5 rounded-2xl">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">How Scoring Works</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2"><span className="text-emerald-400 font-mono">+{WEIGHTS.handlerJoined}</span> Joined a call</div>
            <div className="flex items-center gap-2"><span className="text-emerald-400 font-mono">+{WEIGHTS.doubtSessionAttended}</span> Doubt session attended</div>
            <div className="flex items-center gap-2"><span className="text-emerald-400 font-mono">+{WEIGHTS.registration}</span> Registered for call</div>
            <div className="flex items-center gap-2"><span className="text-emerald-400 font-mono">+{WEIGHTS.callingAssistPositive}</span> Positive calling status</div>
            <div className="flex items-center gap-2"><span className="text-amber-400 font-mono">+{WEIGHTS.deposit}</span> Deposit per level</div>
            <div className="flex items-center gap-2"><span className="text-amber-400 font-mono">+{WEIGHTS.won}</span> Won per level</div>
            <div className="flex items-center gap-2"><span className="text-indigo-400 font-mono">+{WEIGHTS.levelProgression}</span> Level progression</div>
            <div className="flex items-center gap-2"><span className="text-red-400 font-mono">{WEIGHTS.negativeWontAttend}</span> Won't attend / don't call</div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={!!detailLead}
        onClose={() => setDetailLead(null)}
        title="Lead Analysis"
        size="lg"
      >
        {detailLead && (
          <LeadDetailModal
            lead={detailLead}
            programName={programs.find((p) => p.id === selectedProgramId)?.name ?? ''}
            onClose={() => setDetailLead(null)}
          />
        )}
      </Modal>
    </div>
  );
}
