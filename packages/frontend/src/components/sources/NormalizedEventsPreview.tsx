'use client';

import { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  RefreshCw,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { api, CanonicalEvent, CanonicalEventStatus } from '../../lib/api';
import { Pagination } from '../common/Pagination';

export function NormalizedEventsPreview() {
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBatch, setFilterBatch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  async function loadEvents() {
    setLoading(true);
    try {
      const res = await api.getEvents(page, limit, filterBatch.trim() || undefined);
      setEvents(res.data);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, [page, limit, filterBatch]);

  function handleFilterChange(val: string) {
    setFilterBatch(val);
    setPage(1); // Reset to page 1 on filter query change
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getStatusBadge(status: CanonicalEventStatus) {
    switch (status) {
      case CanonicalEventStatus.ACCEPTED:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
            ACCEPTED
          </span>
        );
      case CanonicalEventStatus.DUPLICATE:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
            DUPLICATE
          </span>
        );
      case CanonicalEventStatus.CONFLICT:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
            CONFLICT
          </span>
        );
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Layers className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Normalized Operational Dataset</h3>
            <p className="text-xs text-slate-400">Canonical events transformed with complete source provenance</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by Batch ID (e.g. BATCH-001)"
              value={filterBatch}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={loadEvents}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh events"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Batch & Master</th>
              <th className="px-4 py-3">Station</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Event Timestamp</th>
              <th className="px-4 py-3">Source Provenance</th>
              <th className="px-4 py-3">Dedup Status</th>
              <th className="px-4 py-3 text-right">Raw Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading canonical events...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No normalized events available. Run a collection to populate the operational dataset.
                </td>
              </tr>
            ) : (
              events.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-100">{evt.batchId}</div>
                    <div className="text-[10px] text-slate-500">
                      {evt.lineId || 'No Line'} · {evt.workOrderId || 'No WO'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[11px] border border-slate-700/60">
                      {evt.stationCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-200 font-semibold">{evt.quantity}</td>
                  <td className="px-4 py-3 text-slate-400">
                    <div>{new Date(evt.eventTime).toLocaleTimeString()}</div>
                    <div className="text-[10px] text-slate-500">{new Date(evt.eventTime).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-1">
                      <span className="text-cyan-400 font-semibold">{evt.sourceType}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-slate-300 truncate max-w-30" title={evt.sourceRecordId}>
                        {evt.sourceRecordId}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-35" title={evt.collectionRunId ?? 'Streaming Ingestion'}>
                      Run: {evt.collectionRunId ? `${evt.collectionRunId.slice(0, 8)}...` : 'Stream'}
                    </div>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(evt.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(evt.rawPayload, null, 2), evt.id)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] inline-flex items-center space-x-1 transition border border-slate-700"
                    >
                      {copiedId === evt.id ? (
                        <>
                          <CheckCheck className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <Pagination
        currentPage={page}
        totalItems={total}
        pageSize={limit}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(s) => {
          setLimit(s);
          setPage(1);
        }}
        itemLabel="canonical events"
        disabled={loading}
      />
    </div>
  );
}
