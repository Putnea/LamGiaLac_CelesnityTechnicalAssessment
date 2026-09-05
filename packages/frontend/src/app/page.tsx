'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Factory,
  Database,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Ban,
  PlayCircle,
  Activity,
  Globe,
  Server,
  RefreshCw,
} from 'lucide-react';
import { api, LineSummary, BatchView, BatchState, DataSource } from '../lib/api';

export default function OverviewPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [lines, setLines] = useState<LineSummary[]>([]);
  const [batches, setBatches] = useState<BatchView[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSummary() {
    setLoading(true);
    try {
      const [s, l, b] = await Promise.all([
        api.getSources(),
        api.getLines(),
        api.getAllBatches(),
      ]);
      setSources(s);
      setLines(l);
      setBatches(b);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const totalBatches = batches.length;
  const inProgressBatches = batches.filter((b) => b.state === BatchState.IN_PROGRESS).length;
  const blockedBatches = batches.filter((b) => b.state === BatchState.BLOCKED).length;
  const completedBatches = batches.filter((b) => b.state === BatchState.COMPLETED).length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Industrial Traceability & Normalization Platform</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Hotel Linen Laundry <br />
            <span className="bg-linear-to-r from-blue-400 via-cyan-300 to-teal-400 bg-clip-text text-transparent">
              Factory Operations Platform
            </span>
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Ingest, normalize, deduplicate, and track hotel linen batches across a 6-station industrial laundry line in real-time with full data provenance.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/production"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-blue-600/30 transition"
            >
              <Factory className="w-4 h-4" />
              <span>View Production Lines</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/sources"
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center space-x-2 border border-slate-700 transition"
            >
              <Database className="w-4 h-4" />
              <span>Manage Data Sources</span>
            </Link>
          </div>
        </div>

        {/* Decorative Grid Pattern */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] bg-size-[16px_16px] pointer-events-none" />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-cyan-950/50 border border-cyan-800/40 text-cyan-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active Sources</div>
            <div className="text-2xl font-bold text-slate-100">{sources.length}</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-800/40 text-blue-400">
            <PlayCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">In Progress Batches</div>
            <div className="text-2xl font-bold text-blue-400">{inProgressBatches}</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/40 text-rose-400">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Blocked Batches</div>
            <div className="text-2xl font-bold text-rose-400">{blockedBatches}</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/40 text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Completed Batches</div>
            <div className="text-2xl font-bold text-emerald-400">{completedBatches}</div>
          </div>
        </div>
      </div>

      {/* 6-Station Architecture Pipeline Overview */}
      <div className="p-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-slate-100">6-Station Operational Flow Pipeline</h2>
          </div>
          <span className="text-xs font-mono text-slate-500">Deterministic deduplication & provenance</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { step: 1, name: 'RECEIVING', source: 'REST API & Crawler', icon: '📥' },
            { step: 2, name: 'SORTING', source: 'Production DB', icon: '🧺' },
            { step: 3, name: 'WASHING', source: 'Production DB / MQTT', icon: '🧼' },
            { step: 4, name: 'DRYING', source: 'Production DB / MQTT', icon: '💨' },
            { step: 5, name: 'FOLDING', source: 'Production DB', icon: '👔' },
            { step: 6, name: 'DISPATCH', source: 'REST API & DB', icon: '🚚' },
          ].map((s) => (
            <div
              key={s.step}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between"
            >
              <div>
                <div className="text-xl mb-1">{s.icon}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Step {s.step}</div>
                <h3 className="text-sm font-bold text-slate-200 mt-0.5">{s.name}</h3>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
                {s.source}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
