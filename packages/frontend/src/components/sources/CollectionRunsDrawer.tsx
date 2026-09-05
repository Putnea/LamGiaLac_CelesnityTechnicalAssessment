'use client';

import { useState, useEffect } from 'react';
import { X, History, AlertTriangle, CheckCircle, Clock, XCircle, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { api, CollectionRun, CollectionStatus, DataSource } from '../../lib/api';

interface CollectionRunsDrawerProps {
  source: DataSource | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CollectionRunsDrawer({ source, isOpen, onClose }: CollectionRunsDrawerProps) {
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  async function loadRuns() {
    if (!source) return;
    setLoading(true);
    try {
      const res = await api.getSourceRuns(source.id, 1, 30);
      setRuns(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && source) {
      loadRuns();
    }
  }, [isOpen, source]);

  if (!isOpen || !source) return null;

  function getStatusBadge(status: CollectionStatus) {
    switch (status) {
      case CollectionStatus.COMPLETED:
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Completed</span>
          </span>
        );
      case CollectionStatus.PARTIAL:
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Partial (Warnings)</span>
          </span>
        );
      case CollectionStatus.FAILED:
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </span>
        );
      case CollectionStatus.RUNNING:
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Running...</span>
          </span>
        );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-slide-left">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">Collection History</h2>
              <p className="text-xs text-slate-400 font-mono">{source.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadRuns}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No collection runs recorded yet for this source.
            </div>
          ) : (
            runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const hasErrors = run.errors && run.errors.length > 0;

              return (
                <div
                  key={run.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700/80 transition-all overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    className="p-4 cursor-pointer flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(run.status)}
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(run.startedAt).toLocaleTimeString()} · {new Date(run.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-slate-300 pt-1 font-mono">
                        <span>Collected: <strong className="text-emerald-400">{run.recordsCollected}</strong></span>
                        {run.recordsFailed > 0 && (
                          <span>Failed: <strong className="text-rose-400">{run.recordsFailed}</strong></span>
                        )}
                        <span>Duration: <strong className="text-slate-400">{run.durationMs ?? 0}ms</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {hasErrors && (
                        <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {run.errors.length} err
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Error Inspection */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-900/60 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono">Run ID: {run.id}</span>
                        <span>Protocol: {run.sourceType}</span>
                      </div>

                      {hasErrors ? (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-xs font-semibold text-rose-400 flex items-center">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Error & Warning Log:
                          </p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {run.errors.map((err, i) => (
                              <div
                                key={i}
                                className="p-2 rounded bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-300"
                              >
                                <div className="text-rose-300">{err.message}</div>
                                {err.context && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">{err.context}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-400/80 font-mono mt-2">
                          ✓ Completed without errors or warnings.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
