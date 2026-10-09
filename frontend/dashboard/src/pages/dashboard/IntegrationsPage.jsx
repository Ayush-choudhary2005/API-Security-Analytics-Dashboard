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
  MessageSquare,
  Bot,
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
      const list = res.data?.webhooks || (res.data?.webhook ? [res.data.webhook] : []);
      setWebhooks(list);
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

  const handleToggleWebhook = async (provider, currentEnabled) => {
    if (!currentProject?.id) return;
    try {
      await webhookService.toggle(currentProject.id, provider, !currentEnabled);
      fetchWebhooks();
    } catch (err) {
      console.error(`Failed to toggle ${provider} webhook:`, err);
    }
  };

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
    setTestResult({ provider, status: 'testing', message: 'Dispatching test incident payload...' });
    try {
      const res = await webhookService.test(currentProject.id, provider);
      setTestResult({
        provider,
        status: 'success',
        message: res.data?.message || 'Verification payload delivered successfully.',
      });
    } catch (err) {
      setTestResult({
        provider,
        status: 'error',
        message: err.response?.data?.error || 'Test alert delivery rejected by endpoint.',
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
      <div className="border-b border-[#1E2127] pb-4">
        <div className="flex items-center space-x-2.5">
          <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">External Alert Pipelines & Integrations</h1>
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#82AAFF] border border-[#2A2E37]">
            <span>OUTBOUND_WEBHOOKS</span>
          </span>
        </div>
        <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
          Route real-time threat intelligence and anomaly detections into your security operations channels.
        </p>
      </div>

      {testResult && (
        <div
          className={`p-3 rounded border text-xs font-mono flex items-center space-x-2 transition-all ${
            testResult.status === 'success'
              ? 'bg-[#101216] border-[#C3E88D]/40 text-[#C3E88D]'
              : testResult.status === 'error'
              ? 'bg-[#101216] border-[#F07178]/40 text-[#F07178]'
              : 'bg-[#101216] border-[#1E2127] text-[#82AAFF]'
          }`}
        >
          {testResult.status === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#C3E88D]" />}
          {testResult.status === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#F07178]" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {/* SLACK INTEGRATION */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] font-mono text-xs font-bold">
                SL
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E6E8EB]">Slack Incident Dispatcher</h3>
                <p className="text-xs text-[#9BA1AC] font-mono">Real-time threat notifications sent directly to Slack channels.</p>
              </div>
            </div>

            {slackConfig && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTestWebhook('slack')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] text-[#9BA1AC] hover:text-[#E6E8EB] text-xs font-mono transition-colors border border-[#1E2127]"
                >
                  <Send className="w-3.5 h-3.5 text-[#82AAFF]" />
                  <span>Send Test Alert</span>
                </button>
                <button
                  onClick={() => handleDeleteWebhook('slack')}
                  className="p-1.5 rounded text-[#7B818B] hover:text-[#F07178] hover:bg-[#16181D] transition-colors"
                  title="Disconnect Slack"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {slackConfig ? (
            <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#82AAFF] flex items-center justify-between">
              <span className="truncate">{slackConfig.masked_url || 'https://hooks.slack.com/services/****'}</span>
              <button
                onClick={() => handleToggleWebhook('slack', slackConfig.enabled)}
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  slackConfig.enabled
                    ? 'bg-[#16181D] text-[#C3E88D] border-[#C3E88D]/30 hover:border-[#C3E88D]'
                    : 'bg-[#16181D] text-[#7B818B] border-[#7B818B]/30 hover:border-[#7B818B]'
                }`}
                title={slackConfig.enabled ? 'Click to pause alert stream' : 'Click to resume alert stream'}
              >
                {slackConfig.enabled ? 'ACTIVE_STREAM' : 'STREAM_PAUSED'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveSlack} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Slack Incoming Webhook URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs font-mono text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={slackSaving}
                className="px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs"
              >
                {slackSaving ? 'CONNECTING...' : 'CONNECT SLACK CHANNEL'}
              </button>
            </form>
          )}
        </div>

        {/* DISCORD INTEGRATION */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] font-mono text-xs font-bold">
                DC
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E6E8EB]">Discord Security Webhooks</h3>
                <p className="text-xs text-[#9BA1AC] font-mono">Post rich JSON incident embeds into DevOps & SecOps channels.</p>
              </div>
            </div>

            {discordConfig && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTestWebhook('discord')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] text-[#9BA1AC] hover:text-[#E6E8EB] text-xs font-mono transition-colors border border-[#1E2127]"
                >
                  <Send className="w-3.5 h-3.5 text-[#82AAFF]" />
                  <span>Send Test Alert</span>
                </button>
                <button
                  onClick={() => handleDeleteWebhook('discord')}
                  className="p-1.5 rounded text-[#7B818B] hover:text-[#F07178] hover:bg-[#16181D] transition-colors"
                  title="Disconnect Discord"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {discordConfig ? (
            <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#82AAFF] flex items-center justify-between">
              <span className="truncate">{discordConfig.masked_url || 'https://discord.com/api/webhooks/****'}</span>
              <button
                onClick={() => handleToggleWebhook('discord', discordConfig.enabled)}
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  discordConfig.enabled
                    ? 'bg-[#16181D] text-[#C3E88D] border-[#C3E88D]/30 hover:border-[#C3E88D]'
                    : 'bg-[#16181D] text-[#7B818B] border-[#7B818B]/30 hover:border-[#7B818B]'
                }`}
                title={discordConfig.enabled ? 'Click to pause alert stream' : 'Click to resume alert stream'}
              >
                {discordConfig.enabled ? 'ACTIVE_STREAM' : 'STREAM_PAUSED'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveDiscord} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Discord Webhook URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://discord.com/api/webhooks/XXXX/YYYY"
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#82AAFF] rounded px-3 py-2 text-xs font-mono text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={discordSaving}
                className="px-4 py-2 rounded bg-[#82AAFF] hover:bg-[#9bbdff] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs"
              >
                {discordSaving ? 'CONNECTING...' : 'CONNECT DISCORD SERVER'}
              </button>
            </form>
          )}
        </div>

        {/* GEMINI AI THREAT ENGINE */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-9 h-9 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#FFCB6B]">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Google Gemini Autonomous Threat Synthesis</h3>
              <p className="text-xs text-[#9BA1AC] font-mono">Server-side root-cause attack synthesis with heuristic offline fallback.</p>
            </div>
          </div>

          <div className="p-4 rounded bg-[#0A0B0D] border border-[#1E2127] space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#7B818B]">LLM Engine Model:</span>
              <span className="text-[#C792EA]">Gemini 1.5 Pro / Flash (Autonomous Fallback)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#7B818B]">Credential Security:</span>
              <span className="text-[#C3E88D]">Backend Vault Encrypted (GEMINI_API_KEY)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#7B818B]">Tenant Boundary Isolation:</span>
              <span className="text-[#E6E8EB]">Zero Data Retention / Ephemeral Prompt Buffer</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationsPage;
