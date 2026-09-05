'use client';

import { useState } from 'react';
import { X, Plus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api, SourceType, DataSource } from '../../lib/api';

interface RegisterSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (source: DataSource) => void;
}

const DEFAULT_SOURCE_NAMES: Record<SourceType, string> = {
  [SourceType.API]: 'Factory REST API',
  [SourceType.CRAWLER]: 'Supplier Delivery Crawler',
  [SourceType.DATABASE]: 'Plant Production DB',
  [SourceType.MQTT]: 'Machine Telemetry MQTT',
};

const DEFAULT_TARGETS: Record<SourceType, string> = {
  [SourceType.API]: '/dispatch',
  [SourceType.CRAWLER]: 'http://fixture-supplier:3002/deliveries?page=1',
  [SourceType.DATABASE]: 'production_events',
  [SourceType.MQTT]: 'factory/line/+/station/+/batch/+',
};

export function RegisterSourceModal({ isOpen, onClose, onCreated }: RegisterSourceModalProps) {
  const [type, setType] = useState<SourceType>(SourceType.API);
  const [name, setName] = useState(DEFAULT_SOURCE_NAMES[SourceType.API]);

  // API config
  const [apiBaseUrl, setApiBaseUrl] = useState('http://fixture-api:3001');
  const [apiToken, setApiToken] = useState('');

  // Crawler config
  const [crawlerStartUrl, setCrawlerStartUrl] = useState('http://fixture-supplier:3002/deliveries?page=1');

  // DB config
  const [dbHost, setDbHost] = useState('fixture-db');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('factory_production');
  const [dbUser, setDbUser] = useState('factory');
  const [dbPass, setDbPass] = useState('factory_secret');

  // MQTT config
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState('mqtt://mqtt-broker:1883');
  const [mqttTopicPattern, setMqttTopicPattern] = useState('factory/line/+/station/+/batch/+');

  const [selectedTarget, setSelectedTarget] = useState(DEFAULT_TARGETS[SourceType.API]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleTypeChange(newType: SourceType) {
    const isDefaultName = Object.values(DEFAULT_SOURCE_NAMES).includes(name) || !name.trim();
    setType(newType);
    if (isDefaultName) {
      setName(DEFAULT_SOURCE_NAMES[newType]);
    }
    setSelectedTarget(DEFAULT_TARGETS[newType]);
  }

  function buildPayload() {
    let config: Record<string, any> = {};
    let credentials: { password?: string; token?: string } | undefined = undefined;

    if (type === SourceType.API) {
      config = { baseUrl: apiBaseUrl };
      if (apiToken) credentials = { token: apiToken };
    } else if (type === SourceType.CRAWLER) {
      config = { startUrl: crawlerStartUrl };
    } else if (type === SourceType.DATABASE) {
      config = { host: dbHost, port: dbPort, database: dbName, username: dbUser };
      if (dbPass) credentials = { password: dbPass };
    } else if (type === SourceType.MQTT) {
      config = { brokerUrl: mqttBrokerUrl, topicPattern: mqttTopicPattern };
    }

    return {
      name,
      type,
      config,
      credentials,
      selectedTarget:
        selectedTarget ||
        DEFAULT_TARGETS[type],
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      const created = await api.createSource(payload);
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register source');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-slate-100">Register Data Source</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Source Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Primary REST API Fixture"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500 font-sans"
            />
          </div>

          {/* Source Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Source Protocol / Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[SourceType.API, SourceType.CRAWLER, SourceType.DATABASE, SourceType.MQTT].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold text-center border transition-all ${type === t
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-sm'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Configuration Fields */}
          {type === SourceType.API && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">API Configuration</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Base URL</label>
                <input
                  type="text"
                  required
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Initial Target Endpoint</label>
                <input
                  type="text"
                  value={selectedTarget}
                  placeholder="/dispatch, /receiving, /batches"
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {type === SourceType.CRAWLER && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Crawler Configuration</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Start URL (Paginated HTML site)</label>
                <input
                  type="text"
                  required
                  value={crawlerStartUrl}
                  onChange={(e) => {
                    setCrawlerStartUrl(e.target.value);
                    setSelectedTarget(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {type === SourceType.DATABASE && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">PostgreSQL Connection</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Host</label>
                  <input
                    type="text"
                    required
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Port</label>
                  <input
                    type="text"
                    required
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Database</label>
                  <input
                    type="text"
                    required
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Password (Encrypted at Rest)</label>
                <input
                  type="password"
                  value={dbPass}
                  onChange={(e) => setDbPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Table Name</label>
                <input
                  type="text"
                  value={selectedTarget}
                  placeholder="production_events"
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {type === SourceType.MQTT && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">MQTT Configuration</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Broker URL</label>
                <input
                  type="text"
                  required
                  value={mqttBrokerUrl}
                  onChange={(e) => setMqttBrokerUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Topic Pattern</label>
                <input
                  type="text"
                  value={mqttTopicPattern}
                  onChange={(e) => setMqttTopicPattern(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm flex items-center space-x-2 transition shadow-lg shadow-blue-600/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <span>Register Source</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
