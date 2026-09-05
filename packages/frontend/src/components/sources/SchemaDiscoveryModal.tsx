'use client';

import { useState, useEffect } from 'react';
import { X, Search, Database, FileCode, Check, Loader2, AlertCircle } from 'lucide-react';
import { api, DataSource, SchemaDiscoveryResult, SourceType } from '../../lib/api';

interface SchemaDiscoveryModalProps {
  source: DataSource | null;
  isOpen: boolean;
  onClose: () => void;
  onTargetSelected: (sourceId: string, target: string) => void;
}

export function SchemaDiscoveryModal({
  source,
  isOpen,
  onClose,
  onTargetSelected,
}: SchemaDiscoveryModalProps) {
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<SchemaDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !source) return;
    setSelectedTarget(source.selectedTarget || '');
    setLoading(true);
    setError(null);

    api.discoverSchema(source.id)
      .then((data) => {
        setSchema(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to discover schema');
        setLoading(false);
      });
  }, [isOpen, source]);

  if (!isOpen || !source) return null;

  async function handleSaveTarget() {
    if (!source || !selectedTarget) return;
    setIsSaving(true);
    try {
      await api.updateSource(source.id, { selectedTarget });
      onTargetSelected(source.id, selectedTarget);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update target');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">Schema & Field Discovery</h2>
              <p className="text-xs text-slate-400 font-mono">{source.name} ({source.type})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-sm text-slate-400">Discovering schema and endpoints from source...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Discovery Failed</p>
                <p className="text-xs mt-1 text-rose-300/80">{error}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* REST API Endpoints */}
              {source.type === SourceType.API && schema?.endpoints && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Available REST Endpoints
                  </h3>
                  <div className="space-y-2">
                    {schema.endpoints.map((ep) => (
                      <div
                        key={ep.path}
                        onClick={() => setSelectedTarget(ep.path)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedTarget === ep.path
                            ? 'bg-blue-600/15 border-blue-500/50 shadow-sm'
                            : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-semibold text-blue-400">{ep.path}</span>
                          {selectedTarget === ep.path && (
                            <span className="flex items-center text-xs text-blue-400 font-medium">
                              <Check className="w-3.5 h-3.5 mr-1" /> Target Selected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{ep.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {ep.fields.map((f) => (
                            <span
                              key={f}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Database Tables & Columns */}
              {source.type === SourceType.DATABASE && schema?.tables && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Discovered Tables & Schema
                  </h3>
                  <div className="space-y-3">
                    {schema.tables.map((tbl) => (
                      <div
                        key={tbl.name}
                        onClick={() => setSelectedTarget(tbl.name)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedTarget === tbl.name
                            ? 'bg-blue-600/15 border-blue-500/50 shadow-sm'
                            : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Database className="w-4 h-4 text-cyan-400" />
                            <span className="font-mono text-sm font-semibold text-slate-200">{tbl.name}</span>
                          </div>
                          {selectedTarget === tbl.name && (
                            <span className="flex items-center text-xs text-blue-400 font-medium">
                              <Check className="w-3.5 h-3.5 mr-1" /> Active Target
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {tbl.columns.map((col) => (
                            <div
                              key={col.name}
                              className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono"
                            >
                              <span className="text-slate-300 truncate">{col.name}</span>
                              <span className="text-[10px] text-slate-500">{col.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Crawler Fields */}
              {source.type === SourceType.CRAWLER && schema?.fields && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Scraped HTML Table Columns
                  </h3>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <p className="text-xs text-slate-400">
                      Discovered column headers from delivery table at <span className="font-mono text-slate-300">{(source.config as any)?.startUrl}</span>:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {schema.fields.map((f) => (
                        <span
                          key={f}
                          className="px-2.5 py-1 rounded-md text-xs font-mono bg-blue-900/30 text-blue-300 border border-blue-500/30"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 font-mono">
            Selected Target: <span className="text-slate-200 font-semibold">{selectedTarget || 'None'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Close
            </button>
            <button
              onClick={handleSaveTarget}
              disabled={isSaving || !selectedTarget || selectedTarget === source.selectedTarget}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium text-sm flex items-center space-x-1.5 transition"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Set as Active Target</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
