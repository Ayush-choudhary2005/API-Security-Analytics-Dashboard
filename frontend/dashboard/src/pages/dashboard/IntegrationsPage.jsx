import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Send,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Cpu,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { webhookService } from '../../services/api';

export const IntegrationsPage = () => {
  const { currentProject } = useProject();

  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState(null);

  // Slack state
  const [slackUrl, setSlackUrl] = useState('');
  const [slackSaving, setSlackSaving] = useState(false);

  // Discord state
  const [discordUrl, setDiscordUrl] = useState('');
  const [discordSaving, setDiscordSaving] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const res = await webhookService.list(currentProject.id);
      setWebhooks(res.data?.webhooks || []);
    } catch (err) {
      console.error('Failed to load project webhooks:', err);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const slackConfig = webhooks.find((w) => w.provider === 'slack');
  const discordConfig = webhooks.find((w) => w.provider === 'discord');

  const handleSaveSlack = async (e) => {
    e.preventDefault();
    if (!currentProject?.id || !slackUrl.trim()) return;
    setSlackSaving(true);
    try {
      await webhookService.configure(currentProject.id, {
        provider: 'slack',
        webhook_url: slackUrl.trim(),
        enabled: 1,
      });
      setSlackUrl('');
      fetchWebhooks();
    } catch (err) {
      console.error('Failed to save Slack webhook:', err);
    } finally {
      setSlackSaving(false);
    }
  };

  const handleSaveDiscord = async (e) => {
    e.preventDefault();
    if (!currentProject?.id || !discordUrl.trim()) return;
    setDiscordSaving(true);
    try {
      await webhookService.configure(currentProject.id, {
        provider: 'discord',
        webhook_url: discordUrl.trim(),
        enabled: 1,
      });
      setDiscordUrl('');
      fetchWebhooks();
    } catch (err) {
      console.error('Failed to save Discord webhook:', err);
    } finally {
      setDiscordSaving(false);
    }
  };

  const handleTestWebhook = async (provider) => {
    if (!currentProject?.id) return;
    setTestResult({ provider, status: 'testing', message: 'Sending test dispatch...' });
    try {
      const res = await webhookService.test(currentProject.id, provider);
      setTestResult({
        provider,
        status: 'success',
        message: res.data?.message || 'Test alert delivered successfully.',
      });
    } catch (err) {
      setTestResult({
        provider,
        status: 'error',
        message: err.response?.data?.error || 'Test alert delivery failed.',
      });
    }
  };

  const handleDeleteWebhook = async (provider) => {
    if (!currentProject?.id) return;
    if (!window.confirm(`Disconnect ${provider} integration?`)) return;
    try {
      await webhookService.delete(currentProject.id, provider);
      fetchWebhooks();
    } catch (err) {
      console.error(`Failed to delete ${provider} webhook:`, err);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white tracking-tight">External Integrations</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Route security notifications and threat intelligence to your operational alerting channels.
        </p>
      </div>

      {testResult && (
        <div
          className={`p-3 rounded border text-xs flex items-center space-x-2 ${
            testResult.status === 'success'
              ? 'bg-zinc-900 border-zinc-700 text-white'
              : testResult.status === 'error'
              ? 'bg-zinc-950 border-zinc-700 text-zinc-300'
              : 'bg-black border-zinc-800 text-zinc-300'
          }`}
        >
          {testResult.status === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-white" />}
          {testResult.status === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 text-zinc-400" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {/* SLACK INTEGRATION */}
        <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white font-mono text-xs font-semibold">
                SL
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Slack Incident Alerts</h3>
                <p className="text-xs text-zinc-400">Receive real-time threat notifications in Slack channels.</p>
              </div>
            </div>

            {slackConfig && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTestWebhook('slack')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-colors border border-zinc-800"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Alert</span>
                </button>
                <button
                  onClick={() => handleDeleteWebhook('slack')}
                  className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                  title="Disconnect Slack"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {slackConfig ? (
            <div className="p-3 rounded bg-black border border-zinc-800 font-mono text-xs text-zinc-300 flex items-center justify-between">
              <span className="truncate">{slackConfig.masked_url || 'https://hooks.slack.com/services/****'}</span>
              <span className="text-[10px] font-mono uppercase bg-zinc-900 text-white px-2 py-0.5 rounded border border-zinc-700">
                Connected
              </span>
            </div>
          ) : (
            <form onSubmit={handleSaveSlack} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Slack Incoming Webhook URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
                />
              </div>
              <button
                type="submit"
                disabled={slackSaving}
                className="px-4 py-2 rounded bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors shadow-sm"
              >
                {slackSaving ? 'Connecting...' : 'Connect Slack Channel'}
              </button>
            </form>
          )}
        </div>

        {/* DISCORD INTEGRATION */}
        <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white font-mono text-xs font-semibold">
                DC
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Discord Webhooks</h3>
                <p className="text-xs text-zinc-400">Post rich embed alerts into security operations servers.</p>
              </div>
            </div>

            {discordConfig && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTestWebhook('discord')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-colors border border-zinc-800"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Alert</span>
                </button>
                <button
                  onClick={() => handleDeleteWebhook('discord')}
                  className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                  title="Disconnect Discord"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {discordConfig ? (
            <div className="p-3 rounded bg-black border border-zinc-800 font-mono text-xs text-zinc-300 flex items-center justify-between">
              <span className="truncate">{discordConfig.masked_url || 'https://discord.com/api/webhooks/****'}</span>
              <span className="text-[10px] font-mono uppercase bg-zinc-900 text-white px-2 py-0.5 rounded border border-zinc-700">
                Connected
              </span>
            </div>
          ) : (
            <form onSubmit={handleSaveDiscord} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Discord Webhook URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://discord.com/api/webhooks/XXXX/YYYY"
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white"
                />
              </div>
              <button
                type="submit"
                disabled={discordSaving}
                className="px-4 py-2 rounded bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors shadow-sm"
              >
                {discordSaving ? 'Connecting...' : 'Connect Discord Server'}
              </button>
            </form>
          )}
        </div>

        {/* GEMINI AI THREAT ENGINE */}
        <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Google Gemini Autonomous AI Threat Intelligence</h3>
              <p className="text-xs text-zinc-400">Server-side root-cause attack synthesis with heuristic offline fallback.</p>
            </div>
          </div>

          <div className="p-4 rounded bg-black border border-zinc-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Threat Model:</span>
              <span className="font-mono text-zinc-200">Gemini 1.5 Pro / Flash (Dynamic Fallback)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Credential Security:</span>
              <span className="font-mono text-zinc-200">Server-side only (GEMINI_API_KEY)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Data Boundary Isolation:</span>
              <span className="text-zinc-300">Tenant-isolated event telemetry only</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
