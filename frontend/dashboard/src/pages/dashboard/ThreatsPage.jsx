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
  Radio,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { telemetryService, onboardingService } from '../../services/api';

export const ThreatsPage = () => {
  const navigate = useNavigate();
  const { currentOrg, currentProject, openCreateOrgModal, openCreateProjModal } = useProject();

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

  if (!currentProject) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-md p-8 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-[#F07178]/10 border border-[#F07178]/30 flex items-center justify-center mx-auto text-[#F07178]">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Project Selected</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Select or create a project to inspect threat detection logs, anomaly scores, and manage firewall IP blocks.
        </p>
        <div className="pt-2">
          {currentOrg ? (
            <button
              onClick={openCreateProjModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#82AAFF] hover:bg-[#9bbefc] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
            >
              <span>Create Project</span>
            </button>
          ) : (
            <button
              onClick={openCreateOrgModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
            >
              <span>Create Workspace</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Threat Registry & Active Defense</h1>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#F07178] border border-[#2A2E37]">
              <span>ACTIVE_FIREWALL</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Machine learning anomaly scoring, volumetric flood filters, and automated tenant rate-limiting.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleSimulateAttack}
            disabled={simulatingAttack}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] border border-[#FFCB6B]/40 text-[#FFCB6B] text-xs font-mono font-medium transition-colors"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{simulatingAttack ? 'INJECTING PROBE...' : 'SIMULATE ATTACK'}</span>
          </button>
          <button
            onClick={() => setShowBlockModal(true)}
            className="inline-flex items-center space-x-1 px-3.5 py-1.5 rounded bg-[#F07178] hover:bg-[#fa8b91] text-[#0A0B0D] text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Block IP Address</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="p-3 rounded bg-[#101216] border border-[#1E2127] flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-[#7B818B] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by vector, IP, or endpoint..."
            className="w-full bg-[#16181D] border border-[#1E2127] rounded pl-8 pr-3 py-1.5 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-[#16181D] border border-[#1E2127] rounded px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          >
            <option value="ALL">SEVERITY: ALL</option>
            <option value="critical">CRITICAL</option>
            <option value="high">HIGH</option>
            <option value="medium">MEDIUM</option>
            <option value="low">LOW</option>
          </select>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="rounded bg-[#101216] border border-[#1E2127] overflow-hidden">
        <div className="p-3.5 border-b border-[#1E2127] flex items-center justify-between bg-[#16181D]">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-[#F07178]" />
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Detected Security Incidents</h3>
          </div>
          <span className="text-[10px] font-mono text-[#7B818B]">{filteredAlerts.length} RECORDS BUFFERED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#101216] text-[#7B818B] font-mono text-[10px] uppercase border-b border-[#1E2127]">
              <tr>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Attack Signature</th>
                <th className="py-2.5 px-3">Anomaly Score</th>
                <th className="py-2.5 px-3">Target Endpoint</th>
                <th className="py-2.5 px-3">Host Origin IP</th>
                <th className="py-2.5 px-3">Incident Timestamp</th>
                <th className="py-2.5 px-3 text-right">Investigation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2127]/60">
              {filteredAlerts.map((alt) => (
                <tr key={alt.id} className="hover:bg-[#16181D]/60 transition-colors">
                  <td className="py-2 px-3 font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                        alt.severity === 'critical' || alt.severity === 'high'
                          ? 'bg-[#F07178]/15 text-[#F07178] border-[#F07178]/30'
                          : 'bg-[#FFCB6B]/15 text-[#FFCB6B] border-[#FFCB6B]/30'
                      }`}
                    >
                      {alt.severity || 'high'}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-medium text-[#E6E8EB]">
                    {(alt.attack_type || 'Anomaly Detected').replace('_', ' ')}
                  </td>
                  <td className="py-2 px-3 font-mono text-[#C792EA]">
                    {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(3) : alt.anomaly_score}
                  </td>
                  <td className="py-2 px-3 font-mono text-[#9BA1AC]">{alt.endpoint || '/api'}</td>
                  <td className="py-2 px-3 font-mono text-[#82AAFF]">{alt.ip || alt.source_ip || '127.0.0.1'}</td>
                  <td className="py-2 px-3 text-[#7B818B] font-mono text-[11px]">
                    {alt.timestamp ? new Date(alt.timestamp * 1000).toLocaleString() : 'Recent'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => navigate(`/app/investigations?alert_id=${alt.id}`)}
                      className="inline-flex items-center space-x-1 text-[#82AAFF] hover:underline text-xs font-mono"
                    >
                      <span>Root Cause</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#7B818B] font-mono">
                    Zero threat incidents logged for this project scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blocked IP Table */}
      <div className="rounded bg-[#101216] border border-[#1E2127] p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#1E2127] pb-2">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-[#FFCB6B]" />
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Active IP Defense Deny-List</h3>
          </div>
          <span className="text-[10px] font-mono text-[#7B818B]">{blockedIPs.length} ENFORCED RULES</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#16181D] text-[#7B818B] text-[10px] uppercase border-b border-[#1E2127]">
              <tr>
                <th className="py-2 px-3">IP Address</th>
                <th className="py-2 px-3">Reason / Vector</th>
                <th className="py-2 px-3">Blocked Timestamp</th>
                <th className="py-2 px-3 text-right">Enforcement Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2127]/60">
              {blockedIPs.map((b) => (
                <tr key={b.ip} className="hover:bg-[#16181D]/60 transition-colors">
                  <td className="py-2 px-3 text-[#F07178] font-bold">{b.ip}</td>
                  <td className="py-2 px-3 text-[#9BA1AC] font-sans">{b.reason || 'Threshold breach'}</td>
                  <td className="py-2 px-3 text-[#7B818B]">
                    {b.blocked_at ? new Date(b.blocked_at * 1000).toLocaleString() : 'Active'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleUnblock(b.ip)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-[#16181D] hover:bg-[#1E2127] text-[#9BA1AC] hover:text-[#E6E8EB] text-xs font-mono border border-[#1E2127] transition-colors"
                    >
                      <Unlock className="w-3 h-3 text-[#C3E88D]" />
                      <span>Unblock</span>
                    </button>
                  </td>
                </tr>
              ))}
              {blockedIPs.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-[#7B818B] font-mono">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#101216] border border-[#2A2E37] rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1">Manually Block IP Address</h3>
            <p className="text-xs text-[#9BA1AC] mb-4">
              Requests matching this IP address will immediately receive HTTP 429 and be blocked at ingestion.
            </p>
            <form onSubmit={handleManualBlock} className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Host IP Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 198.51.100.45"
                  value={blockIpInput}
                  onChange={(e) => setBlockIpInput(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#F07178] rounded px-3 py-2 text-xs font-mono text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Suspected credential stuffing probe"
                  value={blockReasonInput}
                  onChange={(e) => setBlockReasonInput(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#F07178] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors"
                />
              </div>
              <div className="flex justify-end space-x-2.5 pt-2 border-t border-[#1E2127]">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-3 py-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={blockLoading}
                  className="px-3.5 py-1.5 text-xs bg-[#F07178] hover:bg-[#fa8b91] text-[#0A0B0D] font-semibold rounded transition-colors shadow-xs"
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

export default ThreatsPage;

