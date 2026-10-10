import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Lock,
  Server,
  Zap,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useProject } from '../../context/ProjectContext';
import { telemetryService } from '../../services/api';
import { getSocket } from '../../services/socket';
import { ThreatMap } from '../../components/ThreatMap';

const PIE_COLORS = ['#C792EA', '#82AAFF', '#F07178', '#FFCB6B', '#C3E88D', '#7B818B'];

export const OverviewPage = () => {
  const navigate = useNavigate();
  const {
    currentOrg,
    organizations,
    currentProject,
    projects,
    openCreateOrgModal,
    openCreateProjModal,
  } = useProject();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [historyData, setHistoryData] = useState([]);

  const fetchData = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [statsRes, eventsRes, alertsRes, blockedRes, histRes] = await Promise.allSettled([
        telemetryService.getAlertStats(currentProject.id),
        telemetryService.getRecentEvents(currentProject.id, 25),
        telemetryService.getAlerts(currentProject.id, 15),
        telemetryService.getBlockedIPs(currentProject.id),
        telemetryService.getHistory(currentProject.id),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (eventsRes.status === 'fulfilled') {
        const val = eventsRes.value.data;
        setEvents(Array.isArray(val) ? val : (val?.events || []));
      }
      if (alertsRes.status === 'fulfilled') {
        const val = alertsRes.value.data;
        setAlerts(Array.isArray(val) ? val : (val?.alerts || []));
      }
      if (blockedRes.status === 'fulfilled') {
        const val = blockedRes.value.data;
        setBlockedIPs(Array.isArray(val) ? val : (val?.blocked_ips || []));
      }
      if (histRes.status === 'fulfilled') {
        const val = histRes.value.data;
        setHistoryData(Array.isArray(val) ? val : (val?.timeline || val?.history || []));
      }
    } catch (err) {
      console.error('Error loading dashboard overview:', err);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentProject?.id) return;

    const onNewEvent = (ev) => {
      setEvents((prev) => [ev, ...prev.slice(0, 24)]);
    };

    const onNewAlert = (alt) => {
      setAlerts((prev) => [alt, ...prev.slice(0, 14)]);
      telemetryService.getAlertStats(currentProject.id).then((res) => setStats(res.data)).catch(() => {});
    };

    const onBlocked = (item) => {
      setBlockedIPs((prev) => [item, ...prev]);
    };

    const onUnblocked = (item) => {
      setBlockedIPs((prev) => prev.filter((b) => b.ip !== item.ip));
    };

    socket.on('new_event', onNewEvent);
    socket.on('new_alert', onNewAlert);
    socket.on('ip_blocked', onBlocked);
    socket.on('ip_unblocked', onUnblocked);

    return () => {
      socket.off('new_event', onNewEvent);
      socket.off('new_alert', onNewAlert);
      socket.off('ip_blocked', onBlocked);
      socket.off('ip_unblocked', onUnblocked);
    };
  }, [currentProject?.id]);

  const handleUnblock = async (ip) => {
    if (!currentProject?.id) return;
    try {
      await telemetryService.unblockIP({ ip, project_id: currentProject.id });
      setBlockedIPs((prev) => prev.filter((b) => b.ip !== ip));
    } catch (err) {
      console.error('Failed to unblock IP:', err);
    }
  };

  const rawDist = stats?.attack_distribution || (stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : null);
  const attackDistribution = rawDist
    ? Object.entries(rawDist)
        .filter(([k, count]) => count > 0 && k !== 'attack_distribution')
        .map(([type, count]) => ({
          name: type.replace('_', ' ').toUpperCase(),
          value: count,
        }))
    : [];

  const trafficChartData = historyData.length > 0
    ? historyData.slice(-20).map((h, i) => ({
        time: h.minute || (h.timestamp ? new Date(h.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `T-${20 - i}`),
        requests: h.total !== undefined ? h.total : (h.total_requests || h.count || 1),
        anomalies: h.attacks !== undefined ? h.attacks : (h.anomalies_detected || 0),
        latency: Math.round(h.avg_latency || 12),
      }))
    : [];

  // Empty state: No workspace / organization
  if (!currentOrg || organizations.length === 0) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-md p-8 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-[#C792EA]/10 border border-[#C792EA]/30 flex items-center justify-center mx-auto text-[#C792EA]">
          <Server className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Workspace Created</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Welcome to your security dashboard! Start clean by creating your organization workspace. Once created, you can add projects, generate SDK keys, and begin monitoring live traffic.
        </p>
        <div className="pt-2">
          <button
            onClick={openCreateOrgModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
          >
            <span>Create Workspace</span>
          </button>
        </div>
      </div>
    );
  }

  // Empty state: Workspace exists but no projects
  if (!currentProject || projects.length === 0) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-md p-8 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-[#82AAFF]/10 border border-[#82AAFF]/30 flex items-center justify-center mx-auto text-[#82AAFF]">
          <Server className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Projects in {currentOrg?.name}</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          You don't have any projects in this workspace yet. Create a project to generate your primary SDK API key and begin monitoring incoming traffic.
        </p>
        <div className="pt-2">
          <button
            onClick={openCreateProjModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#82AAFF] hover:bg-[#9bbefc] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
          >
            <span>Create Project</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">{currentProject.name}</h1>
            <span className="text-[10px] font-mono text-[#C792EA] bg-[#16181D] border border-[#2A2E37] px-2 py-0.5 rounded">
              {currentProject.id}
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 flex items-center space-x-2 font-mono">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C3E88D]"></span>
            <span>TELEMETRY_STATUS: ACTIVE</span>
            <span>&bull;</span>
            <span>MODEL: ISOLATION_FOREST</span>
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] text-xs text-[#E6E8EB] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#C792EA]' : 'text-[#7B818B]'}`} />
            <span>Sync</span>
          </button>
          <Link
            to="/app/sdk"
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-[#82AAFF] hover:bg-[#9bbefc] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
          >
            <span>SDK Quickstart</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* TOP UNIFIED METRICS STRIP */}
      <div className="bg-[#101216] border border-[#1E2127] rounded grid grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#1E2127]">
        <div className="p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B818B] block mb-1">Total Requests</span>
          <p className="text-xl font-bold text-[#E6E8EB] font-mono">{stats?.total_events ?? events.length}</p>
          <p className="text-[10px] text-[#9BA1AC] mt-0.5 font-mono">INGESTED VIA SDK</p>
        </div>

        <div className="p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B818B] block mb-1">Threats Detected</span>
          <p className="text-xl font-bold text-[#F07178] font-mono">{stats?.total_alerts ?? alerts.length}</p>
          <p className="text-[10px] text-[#9BA1AC] mt-0.5 font-mono">ML & HEURISTICS</p>
        </div>

        <div className="p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B818B] block mb-1">Active Projects</span>
          <p className="text-xl font-bold text-[#82AAFF] font-mono">{projects.length}</p>
          <p className="text-[10px] text-[#9BA1AC] mt-0.5 font-mono">IN TENANT SCOPE</p>
        </div>

        <div className="p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B818B] block mb-1">Risk Score</span>
          <p className="text-xl font-bold text-[#C792EA] font-mono">
            {stats?.max_anomaly_score && (events.length > 0 || stats?.total_events > 0)
              ? Number(stats.max_anomaly_score).toFixed(2)
              : '0.00'}
          </p>
          <p className="text-[10px] text-[#9BA1AC] mt-0.5 font-mono">ISOLATION FOREST MAX</p>
        </div>

        <div className="p-4 col-span-2 lg:col-span-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B818B] block mb-1">Blocked IPs</span>
          <p className="text-xl font-bold text-[#FFCB6B] font-mono">{blockedIPs.length}</p>
          <p className="text-[10px] text-[#9BA1AC] mt-0.5 font-mono">ACTIVE MITIGATION</p>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Traffic Over Time */}
        <div className="lg:col-span-2 p-4.5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center justify-between mb-3 border-b border-[#1E2127] pb-2">
            <div>
              <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Traffic & Latency Timeline</h3>
              <p className="text-[11px] text-[#9BA1AC]">Throughput volume vs anomalous outliers</p>
            </div>
            <div className="flex items-center space-x-3 text-[10px] font-mono">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-[#82AAFF]"></span>
                <span className="text-[#9BA1AC]">REQUESTS</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-[#F07178]"></span>
                <span className="text-[#9BA1AC]">ANOMALIES</span>
              </span>
            </div>
          </div>
          <div className="h-60">
            {trafficChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficChartData}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#1E2127" />
                  <XAxis dataKey="time" stroke="#7B818B" fontSize={10} tickLine={false} />
                  <YAxis stroke="#7B818B" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16181D', borderColor: '#2A2E37', borderRadius: '6px', fontSize: '11px', color: '#E6E8EB' }}
                  />
                  <Area type="monotone" dataKey="requests" stroke="#82AAFF" strokeWidth={1.5} fill="#82AAFF" fillOpacity={0.12} name="Requests" />
                  <Area type="monotone" dataKey="anomalies" stroke="#F07178" strokeWidth={1.5} fill="#F07178" fillOpacity={0.2} name="Anomalies" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <Activity className="w-7 h-7 text-[#7B818B] mb-2 opacity-50" />
                <p className="text-xs text-[#E6E8EB] font-medium">No Ingested Traffic Yet</p>
                <p className="text-[11px] text-[#9BA1AC] max-w-xs mt-1">
                  Connect the SDK to start monitoring live API requests and anomaly distributions.
                </p>
                <Link
                  to="/app/sdk"
                  className="mt-3 inline-flex items-center space-x-1 text-xs text-[#82AAFF] hover:underline font-mono"
                >
                  <span>Open SDK Guide</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Attack Distribution */}
        <div className="p-4.5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="mb-3 border-b border-[#1E2127] pb-2">
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Attack Distribution</h3>
            <p className="text-[11px] text-[#9BA1AC]">Classified by machine learning vectors</p>
          </div>
          <div className="h-60 flex items-center justify-center">
            {attackDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attackDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={74}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {attackDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16181D', borderColor: '#2A2E37', borderRadius: '6px', fontSize: '11px', color: '#E6E8EB' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-xs text-[#7B818B] font-mono py-12">No attack signatures recorded</div>
            )}
          </div>
        </div>
      </div>

      {/* THREAT GEOLOCATION MAP */}
      <div className="p-4.5 rounded bg-[#101216] border border-[#1E2127]">
        <div className="flex items-center justify-between mb-3 border-b border-[#1E2127] pb-2">
          <div>
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Threat Geolocation Map</h3>
            <p className="text-[11px] text-[#9BA1AC]">Live coordinate projection of hostile ingress origin IPs</p>
          </div>
          <span className="text-[10px] font-mono text-[#7B818B] bg-[#16181D] border border-[#1E2127] px-2 py-0.5 rounded">
            SOURCE: LIVE_TELEMETRY
          </span>
        </div>
        <ThreatMap threats={alerts.length > 0 ? alerts : events} />
      </div>

      {/* LIVE TABLES ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Event Feed Table */}
        <div className="p-4.5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center justify-between mb-3 border-b border-[#1E2127] pb-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#C3E88D] animate-pulse"></span>
              <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Live Ingest Feed</h3>
            </div>
            <Link to="/app/live" className="text-xs text-[#82AAFF] hover:underline inline-flex items-center space-x-1 font-mono text-[11px]">
              <span>Full Stream</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#16181D] text-[#7B818B] font-mono text-[10px] uppercase border-b border-[#1E2127]">
                <tr>
                  <th className="py-2 px-2.5">Method</th>
                  <th className="py-2 px-2.5">Endpoint</th>
                  <th className="py-2 px-2.5">Status</th>
                  <th className="py-2 px-2.5">Latency</th>
                  <th className="py-2 px-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2127]/60 font-mono">
                {events.slice(0, 8).map((ev, i) => (
                  <tr key={ev.id || i} className="hover:bg-[#16181D]/60 transition-colors">
                    <td className="py-2 px-2.5 font-bold">
                      <span className={
                        ev.method === 'GET' ? 'text-[#C3E88D]' :
                        ev.method === 'POST' ? 'text-[#82AAFF]' :
                        ev.method === 'PUT' ? 'text-[#FFCB6B]' : 'text-[#F07178]'
                      }>
                        {ev.method}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-[#E6E8EB] truncate max-w-[130px]">{ev.endpoint}</td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          ev.status_code >= 500
                            ? 'bg-[#F07178]/15 text-[#F07178] border-[#F07178]/30'
                            : ev.status_code >= 400
                            ? 'bg-[#FFCB6B]/15 text-[#FFCB6B] border-[#FFCB6B]/30'
                            : 'bg-[#C3E88D]/15 text-[#C3E88D] border-[#C3E88D]/30'
                        }`}
                      >
                        {ev.status_code}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-[#9BA1AC]">{Math.round(ev.latency_ms || 10)}ms</td>
                    <td className="py-2 px-2.5 text-[#7B818B]">{ev.ip || '127.0.0.1'}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-[#7B818B] font-mono text-xs">
                      Awaiting SDK telemetry events...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Alerts & Threats Table */}
        <div className="p-4.5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center justify-between mb-3 border-b border-[#1E2127] pb-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#F07178]"></span>
              <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Active Threat Detections</h3>
            </div>
            <Link to="/app/threats" className="text-xs text-[#82AAFF] hover:underline inline-flex items-center space-x-1 font-mono text-[11px]">
              <span>Threat Log</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#16181D] text-[#7B818B] font-mono text-[10px] uppercase border-b border-[#1E2127]">
                <tr>
                  <th className="py-2 px-2.5">Severity</th>
                  <th className="py-2 px-2.5">Attack Type</th>
                  <th className="py-2 px-2.5">Score</th>
                  <th className="py-2 px-2.5">Source IP</th>
                  <th className="py-2 px-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2127]/60">
                {alerts.slice(0, 8).map((alt) => (
                  <tr key={alt.id} className="hover:bg-[#16181D]/60 transition-colors">
                    <td className="py-2 px-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase font-mono border ${
                          alt.severity === 'critical' || alt.severity === 'high'
                            ? 'bg-[#F07178]/15 text-[#F07178] border-[#F07178]/30'
                            : 'bg-[#FFCB6B]/15 text-[#FFCB6B] border-[#FFCB6B]/30'
                        }`}
                      >
                        {alt.severity || 'high'}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 font-medium text-[#E6E8EB]">
                      {(alt.attack_type || 'Anomaly').replace('_', ' ')}
                    </td>
                    <td className="py-2 px-2.5 font-mono text-[#C792EA]">
                      {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(2) : alt.anomaly_score}
                    </td>
                    <td className="py-2 px-2.5 font-mono text-[#7B818B]">{alt.ip || alt.source_ip || '-'}</td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        onClick={() => navigate(`/app/investigations?alert_id=${alt.id}`)}
                        className="text-[11px] text-[#82AAFF] hover:underline font-mono"
                      >
                        Investigate &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-[#7B818B] font-mono text-xs">
                      Zero hostile anomalies flagged. All pipelines baseline normal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* BLOCKED IPS MANAGEMENT */}
      {blockedIPs.length > 0 && (
        <div className="p-4.5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center justify-between mb-3 border-b border-[#1E2127] pb-2">
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Actively Blocked Host IP Addresses</h3>
            <span className="text-[10px] font-mono text-[#FFCB6B] bg-[#16181D] border border-[#1E2127] px-2 py-0.5 rounded">
              {blockedIPs.length} BLOCKED_RULES
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {blockedIPs.map((b) => (
              <div
                key={b.ip}
                className="p-3 rounded bg-[#16181D] border border-[#1E2127] flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-mono text-[#F07178] text-xs font-semibold">{b.ip}</p>
                  <p className="text-[10px] text-[#9BA1AC] truncate max-w-[120px] font-mono mt-0.5">{b.reason || 'Rate limit threshold'}</p>
                </div>
                <button
                  onClick={() => handleUnblock(b.ip)}
                  className="px-2.5 py-1 rounded bg-[#101216] hover:bg-[#1E2127] text-[#9BA1AC] hover:text-[#E6E8EB] text-[10px] font-mono border border-[#1E2127] transition-colors"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewPage;
