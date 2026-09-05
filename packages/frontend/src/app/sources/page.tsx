'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  Plus,
  Play,
  Square,
  Activity,
  Search,
  History,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Layers,
  Radio,
  Globe,
  Server,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { api, DataSource, SourceType } from '../../lib/api';
import { RegisterSourceModal } from '../../components/sources/RegisterSourceModal';
import { SchemaDiscoveryModal } from '../../components/sources/SchemaDiscoveryModal';
import { CollectionRunsDrawer } from '../../components/sources/CollectionRunsDrawer';
import { NormalizedEventsPreview } from '../../components/sources/NormalizedEventsPreview';

export default function SourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sources' | 'events'>('sources');
  const [mqttStreaming, setMqttStreaming] = useState<boolean>(false);

  // Modals & drawers
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [schemaModalSource, setSchemaModalSource] = useState<DataSource | null>(null);
  const [runsDrawerSource, setRunsDrawerSource] = useState<DataSource | null>(null);

  // Per-source action loading state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    id: string;
    variant: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  async function loadSources(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [data, mqttStatus] = await Promise.all([
        api.getSources(),
        api.getMqttStatus().catch(() => null),
      ]);
      setSources(data);
      if (mqttStatus) {
        setMqttStreaming(mqttStatus.isStreaming);
      }
    } catch {
      // ignore
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    loadSources(true);
  }, []);

  async function handleTestConnection(source: DataSource) {
    setTestingId(source.id);
    setActionFeedback(null);
    try {
      const result = await api.testSource(source.id);
      setActionFeedback({
        id: source.id,
        variant: result.success ? 'success' : 'error',
        message: result.message,
      });
      loadSources(false);
    } catch (err: any) {
      setActionFeedback({
        id: source.id,
        variant: 'error',
        message: err.message || 'Test failed',
      });
    } finally {
      setTestingId(null);
    }
  }

  async function handleTriggerCollection(source: DataSource) {
    setCollectingId(source.id);
    setActionFeedback(null);
    try {
      const initialRun = await api.triggerCollection(source.id);

      // Poll until the collection run finishes in the backend
      let run = initialRun;
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        if (run.status !== 'RUNNING') break;
        await new Promise((r) => setTimeout(r, 600));
        try {
          run = await api.getRun(initialRun.id);
        } catch {
          // ignore transient poll error
        }
      }

      if (run.status === 'COMPLETED') {
        setActionFeedback({
          id: source.id,
          variant: 'success',
          message: `✓ Collection completed: ${run.recordsCollected} records collected & normalized in ${run.durationMs ?? 0}ms.`,
        });
      } else if (run.status === 'PARTIAL') {
        setActionFeedback({
          id: source.id,
          variant: 'warning',
          message: `⚠ Collection completed with warnings: ${run.recordsCollected} collected, ${run.recordsFailed} failed (${run.durationMs ?? 0}ms).`,
        });
      } else if (run.status === 'FAILED') {
        const firstErrMsg = run.errors?.[0]?.message || 'Collection run failed';
        setActionFeedback({
          id: source.id,
          variant: 'error',
          message: `✗ Collection failed: ${firstErrMsg}`,
        });
      } else {
        setActionFeedback({
          id: source.id,
          variant: 'success',
          message: `Collection triggered for target "${source.selectedTarget}".`,
        });
      }

      loadSources(false);
    } catch (err: any) {
      setActionFeedback({
        id: source.id,
        variant: 'error',
        message: err.message || 'Collection trigger failed',
      });
    } finally {
      setCollectingId(null);
    }
  }

  async function handleToggleMqttStream(source: DataSource) {
    setCollectingId(source.id);
    setActionFeedback(null);
    try {
      if (mqttStreaming) {
        const res = await api.stopMqttStream(source.id);
        setMqttStreaming(false);
        setActionFeedback({
          id: source.id,
          variant: 'warning',
          message: res.message || 'MQTT stream listener stopped.',
        });
      } else {
        const res = await api.startMqttStream(source.id);
        setMqttStreaming(true);
        setActionFeedback({
          id: source.id,
          variant: 'success',
          message: res.message || 'MQTT stream listener connected and ingesting live telemetry.',
        });
      }
      loadSources(false);
    } catch (err: any) {
      setActionFeedback({
        id: source.id,
        variant: 'error',
        message: err.message || 'Failed to toggle MQTT stream',
      });
    } finally {
      setCollectingId(null);
    }
  }

  async function handleDeleteSource(id: string) {
    if (!confirm('Are you sure you want to delete this data source?')) return;
    try {
      await api.deleteSource(id);
      loadSources(false);
    } catch (err: any) {
      alert(err.message || 'Failed to delete source');
    }
  }

  function getSourceIcon(type: SourceType) {
    switch (type) {
      case SourceType.API:
        return <Globe className="w-4 h-4 text-cyan-400" />;
      case SourceType.CRAWLER:
        return <Search className="w-4 h-4 text-purple-400" />;
      case SourceType.DATABASE:
        return <Server className="w-4 h-4 text-emerald-400" />;
      case SourceType.MQTT:
        return <Radio className="w-4 h-4 text-amber-400" />;
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center space-x-2.5">
            <Database className="w-7 h-7 text-blue-500" />
            <span>Data Sources & Ingestion</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Register, test, discover schemas, and trigger collections from heterogeneous plant sources.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={() => loadSources(true)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Refresh Sources"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsRegisterOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Register Data Source</span>
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('sources')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'sources'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
        >
          <Database className="w-4 h-4" />
          <span>Configured Sources ({sources.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'events'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
        >
          <Layers className="w-4 h-4" />
          <span>Operational Dataset Preview</span>
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'sources' ? (
        <div className="space-y-4">
          {/* Quick Info Bar */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>All external credentials are stored with AES-256-CBC encryption and masked in API responses.</span>
            </div>
            <span className="font-mono text-slate-500">Auto-schema discovery supported</span>
          </div>

          {/* Sources Table / Cards */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-500 font-mono">Loading data sources...</p>
            </div>
          ) : sources.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8">
              <Database className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No Data Sources Configured</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                Register your fixture REST API, Supplier Crawler, or Production PostgreSQL Database to begin collecting operational events.
              </p>
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Register Source</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sources.map((source) => {
                const isTesting = testingId === source.id;
                const isCollecting = collectingId === source.id;
                const feedback = actionFeedback?.id === source.id ? actionFeedback : null;

                return (
                  <div
                    key={source.id}
                    className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700/80 transition-all shadow-sm flex flex-col space-y-4"
                  >
                    {/* Top Row: Name, Type, Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                          {getSourceIcon(source.type)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-slate-100 text-base">{source.name}</h3>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {source.type}
                            </span>
                            {source.type === SourceType.MQTT && mqttStreaming && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                <span>STREAMING LIVE</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
                            {source.type === SourceType.API && `Base: ${(source.config as any)?.baseUrl}`}
                            {source.type === SourceType.CRAWLER && `Start: ${(source.config as any)?.startUrl}`}
                            {source.type === SourceType.DATABASE && `Host: ${(source.config as any)?.host}:${(source.config as any)?.port}/${(source.config as any)?.database}`}
                            {source.type === SourceType.MQTT && `Broker: ${(source.config as any)?.brokerUrl}`}
                          </p>
                        </div>
                      </div>

                      {/* Active target badge */}
                      <div className="flex items-center space-x-2 font-mono text-xs">
                        <span className="text-slate-500">Target:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800/40 text-blue-300 font-semibold truncate max-w-50">
                          {source.selectedTarget || 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Feedback Alert if any */}
                    {feedback && (
                      <div
                        className={`p-3 rounded-xl text-xs flex items-center justify-between font-mono ${
                          feedback.variant === 'warning'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : feedback.variant === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {feedback.variant === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                          ) : feedback.variant === 'success' ? (
                            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                          )}
                          <span>{feedback.message}</span>
                        </div>
                        <button onClick={() => setActionFeedback(null)} className="text-slate-500 hover:text-slate-300">
                          Dismiss
                        </button>
                      </div>
                    )}

                    {/* Bottom Row: Last Activity + Action Buttons */}
                    <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center space-x-4 text-slate-400 font-mono text-[11px]">
                        <span>
                          Last Collected: {source.lastCollectedAt ? new Date(source.lastCollectedAt).toLocaleTimeString() : 'Never'}
                        </span>
                        <span>
                          Last Tested: {source.lastTestResult ? (
                            <strong className={source.lastTestResult === 'OK' ? 'text-emerald-400' : 'text-rose-400'}>
                              {source.lastTestResult}
                            </strong>
                          ) : 'Not tested'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Test Connection */}
                        <button
                          onClick={() => handleTestConnection(source)}
                          disabled={isTesting || isCollecting}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 transition font-medium flex items-center space-x-1.5"
                        >
                          {isTesting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                              <span>Test</span>
                            </>
                          )}
                        </button>

                        {/* Discover Schema */}
                        <button
                          onClick={() => setSchemaModalSource(source)}
                          disabled={isTesting || isCollecting}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 transition font-medium flex items-center space-x-1.5"
                        >
                          <Search className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Discover Schema</span>
                        </button>

                        {/* View History */}
                        <button
                          onClick={() => setRunsDrawerSource(source)}
                          disabled={isTesting || isCollecting}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 transition font-medium flex items-center space-x-1.5"
                        >
                          <History className="w-3.5 h-3.5 text-purple-400" />
                          <span>Runs</span>
                        </button>

                        {/* Trigger Run / Stream Toggle */}
                        {source.type === SourceType.MQTT ? (
                          <button
                            onClick={() => handleToggleMqttStream(source)}
                            disabled={isCollecting || isTesting}
                            className={`px-3.5 py-1.5 rounded-lg text-white transition font-medium flex items-center space-x-1.5 shadow-sm ${
                              mqttStreaming
                                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={mqttStreaming ? 'Stop listening to live MQTT telemetry stream' : 'Start listening to live MQTT telemetry stream'}
                          >
                            {isCollecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{mqttStreaming ? 'Stopping...' : 'Connecting...'}</span>
                              </>
                            ) : mqttStreaming ? (
                              <>
                                <Square className="w-3.5 h-3.5 fill-current" />
                                <span>Stop Stream</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Start Stream</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleTriggerCollection(source)}
                            disabled={isCollecting || isTesting || !source.selectedTarget}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition font-medium flex items-center space-x-1.5 shadow-sm shadow-emerald-600/20"
                          >
                            {isCollecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Collecting...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Collect Now</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Delete/Remove */}
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          disabled={isCollecting || isTesting}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 transition"
                          title="Delete source"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <NormalizedEventsPreview />
      )}

      {/* Modals & Drawers */}
      <RegisterSourceModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onCreated={() => {
          loadSources(false);
        }}
      />

      <SchemaDiscoveryModal
        source={schemaModalSource}
        isOpen={!!schemaModalSource}
        onClose={() => setSchemaModalSource(null)}
        onTargetSelected={() => {
          loadSources(false);
        }}
      />

      <CollectionRunsDrawer
        source={runsDrawerSource}
        isOpen={!!runsDrawerSource}
        onClose={() => setRunsDrawerSource(null)}
      />
    </div>
  );
}
