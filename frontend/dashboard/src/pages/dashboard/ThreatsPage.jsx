import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Lock,
  Unlock,
  Plus,
  Search,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { telemetryService, onboardingService } from '../../services/api';

export const ThreatsPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useProject();

  const [alerts, setAlerts] = useState([]);
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Block IP form state
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockIpInput, setBlockIpInput] = useState('');
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [blockLoading, setBlockLoading] = useState(false);
  const [simulatingAttack, setSimulatingAttack] = useState(false);

  const fetchThreatData = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [alertsRes, blockedRes] = await Promise.all([
        telemetryService.getAlerts(currentProject.id, 50),
        telemetryService.getBlockedIPs(currentProject.id),
      ]);
      const rawAlerts = alertsRes.data;
      setAlerts(Array.isArray(rawAlerts) ? rawAlerts : (rawAlerts?.alerts || []));
      const rawBlocked = blockedRes.data;
      setBlockedIPs(Array.isArray(rawBlocked) ? rawBlocked : (rawBlocked?.blocked_ips || []));
    } catch (err) {
      console.error('Error fetching threats:', err);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    fetchThreatData();
  }, [fetchThreatData]);

  const handleManualBlock = async (e) => {
    e.preventDefault();
    if (!blockIpInput.trim() || !currentProject?.id) return;
    setBlockLoading(true);
    try {
      await telemetryService.blockIP({
        ip: blockIpInput.trim(),
        project_id: currentProject.id,
        reason: blockReasonInput.trim() || 'Manual administrator block',
      });
      setShowBlockModal(false);
      setBlockIpInput('');
      setBlockReasonInput('');
      fetchThreatData();
    } catch (err) {
      console.error('Failed to block IP:', err);
    } finally {
      setBlockLoading(false);
    }
  };

  const handleUnblock = async (ip) => {
    if (!currentProject?.id) return;
    try {
      await telemetryService.unblockIP({ ip, project_id: currentProject.id });
      setBlockedIPs((prev) => prev.filter((b) => b.ip !== ip));
    } catch (err) {
      console.error('Failed to unblock IP:', err);
    }
  };

  const handleSimulateAttack = async () => {
    if (!currentProject?.id) return;
    setSimulatingAttack(true);
    try {
      await onboardingService.sendTestEvent(currentProject.id);
      setTimeout(() => {
        fetchThreatData();
        setSimulatingAttack(false);
      }, 1000);
    } catch (err) {
      console.error('Failed to simulate attack test:', err);
      setSimulatingAttack(false);
    }
  };

  const filteredAlerts = alerts.filter((alt) => {
    const matchSearch =
      !searchTerm ||
      alt.attack_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alt.ip?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alt.endpoint?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchSeverity = severityFilter === 'ALL' || alt.severity?.toLowerCase() === severityFilter.toLowerCase();
    return matchSearch && matchSeverity;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Threats and Active Defense</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Machine learning anomaly detections, brute-force alarms, and automated firewall blocks.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSimulateAttack}
            disabled={simulatingAttack}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/60 text-rose-300 text-xs font-medium transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{simulatingAttack ? 'Injecting Probe...' : 'Simulate Test Attack'}</span>
          </button>
          <button
            onClick={() => setShowBlockModal(true)}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded bg-[#0e1420] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Block IP Address</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="p-3 rounded-md bg-[#0e1420] border border-slate-800 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by attack type, IP, or endpoint..."
            className="w-full bg-[#090d16] border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-[#090d16] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500 font-mono transition-colors"
          >
            <option value="ALL">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="rounded-md bg-[#0e1420] border border-slate-800 overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Detected Security Incidents</h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{filteredAlerts.length} total records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Severity</th>
                <th className="py-2 px-3">Attack Signature</th>
                <th className="py-2 px-3">Anomaly Score</th>
                <th className="py-2 px-3">Endpoint</th>
                <th className="py-2 px-3">Attacker IP</th>
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAlerts.map((alt) => (
                <tr key={alt.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        alt.severity === 'critical' || alt.severity === 'high'
                          ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                          : alt.severity === 'medium'
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
                          : 'bg-sky-950/60 text-sky-400 border border-sky-800/50'
                      }`}
                    >
                      {alt.severity || 'high'}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-200">
                    {(alt.attack_type || 'Anomaly Detected').replace('_', ' ')}
                  </td>
                  <td className="py-2 px-3 font-mono text-sky-400">
                    {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(2) : alt.anomaly_score}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-300">{alt.endpoint || '/api'}</td>
                  <td className="py-2 px-3 font-mono text-slate-400">{alt.ip || alt.source_ip || '127.0.0.1'}</td>
                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                    {alt.timestamp ? new Date(alt.timestamp * 1000).toLocaleString() : 'Recent'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => navigate(`/app/investigations?alert_id=${alt.id}`)}
                      className="inline-flex items-center space-x-1 text-sky-400 hover:text-sky-300 text-xs font-medium hover:underline"
                    >
                      <span>Investigate</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400 font-sans">
                    No active threat alerts registered for this project.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blocked IP Table */}
      <div className="rounded-md bg-[#0e1420] border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Active IP Defense Deny-List</h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{blockedIPs.length} enforced</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#090d16] text-slate-400 text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">IP Address</th>
                <th className="py-2 px-3">Reason / Threat</th>
                <th className="py-2 px-3">Blocked At</th>
                <th className="py-2 px-3 text-right">Enforcement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {blockedIPs.map((b) => (
                <tr key={b.ip} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-white font-medium">{b.ip}</td>
                  <td className="py-2 px-3 text-slate-300 font-sans">{b.reason || 'Threshold breach'}</td>
                  <td className="py-2 px-3 text-slate-400">
                    {b.blocked_at ? new Date(b.blocked_at * 1000).toLocaleString() : 'Active'}
                  </td>
                  <td className="py-2 px-3 text-right font-sans">
                    <button
                      onClick={() => handleUnblock(b.ip)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 text-xs font-medium transition-colors"
                    >
                      <Unlock className="w-3 h-3" />
                      <span>Unblock</span>
                    </button>
                  </td>
                </tr>
              ))}
              {blockedIPs.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-400 font-sans">
                    Zero IP addresses currently denied.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Block IP */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#0e1420] border border-slate-800 rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">Manually Block IP Address</h3>
            <p className="text-xs text-slate-400 mb-4">
              Requests matching this IP address will immediately receive HTTP 429 Too Many Requests.
            </p>
            <form onSubmit={handleManualBlock} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">IP Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 198.51.100.45"
                  value={blockIpInput}
                  onChange={(e) => setBlockIpInput(e.target.value)}
                  className="w-full bg-[#090d16] border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Suspected credential stuffing probe"
                  value={blockReasonInput}
                  onChange={(e) => setBlockReasonInput(e.target.value)}
                  className="w-full bg-[#090d16] border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>
              <div className="flex justify-end space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={blockLoading}
                  className="px-3.5 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded transition-colors"
                >
                  {blockLoading ? 'Applying...' : 'Enforce Deny Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
