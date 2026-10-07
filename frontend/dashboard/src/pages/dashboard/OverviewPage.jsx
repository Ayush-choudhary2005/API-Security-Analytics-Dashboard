import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  Activity,
  AlertTriangle,
  Lock,
  Server,
  Zap,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  Search,
  Filter,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useProject } from '../../context/ProjectContext';
import { telemetryService } from '../../services/api';
import { getSocket } from '../../services/socket';
import { ThreatMap } from '../../components/ThreatMap';

const SEVERITY_COLORS = {
  critical: '#f43f5e',
  high: '#fb7185',
  medium: '#fbbf24',
  low: '#38bdf8',
};

const PIE_COLORS = ['#f43f5e', '#fbbf24', '#38bdf8', '#818cf8', '#34d399', '#a78bfa'];

export const OverviewPage = () => {
  const navigate = useNavigate();
  const { currentProject, projects } = useProject();

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
      if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value.data?.events || []);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data?.alerts || []);
      if (blockedRes.status === 'fulfilled') setBlockedIPs(blockedRes.value.data?.blocked_ips || []);
      if (histRes.status === 'fulfilled') setHistoryData(histRes.value.data?.history || []);
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
      // Refresh stats
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

  // Prepare chart metrics
  const attackDistribution = stats?.attack_distribution
    ? Object.entries(stats.attack_distribution).map(([type, count]) => ({
        name: type.replace('_', ' ').toUpperCase(),
        value: count,
      }))
    : [];

  const severityDistribution = stats?.severity_breakdown
    ? Object.entries(stats.severity_breakdown).map(([sev, count]) => ({
        severity: sev.toUpperCase(),
        count,
        color: SEVERITY_COLORS[sev] || '#94a3b8',
      }))
    : [];

  const trafficChartData = historyData.length > 0
    ? historyData.slice(-20).map((h, i) => ({
        time: h.timestamp ? new Date(h.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `T-${20 - i}`,
        requests: h.total_requests || (h.count || 1),
        anomalies: h.anomalies_detected || 0,
        latency: Math.round(h.avg_latency || 12),
      }))
    : Array.from({ length: 12 }, (_, i) => ({
        time: `${i * 2}:00`,
        requests: Math.floor(Math.random() * 20) + 5,
        anomalies: Math.floor(Math.random() * 2),
        latency: Math.floor(Math.random() * 15) + 8,
      }));

  if (!currentProject) {
    return (
      <div className="py-16 text-center space-y-4">
        <Server className="w-12 h-12 mx-auto text-slate-600" />
        <h2 className="text-lg font-bold text-white">No Project Selected</h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Create or select a project from the top navigation to view security telemetry.
        </p>
        <Link
          to="/app/projects"
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-medium"
        >
          <span>Go to Projects</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white tracking-tight">{currentProject.name}</h1>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
              {currentProject.id}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time API anomaly scoring and active defense telemetry stream.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/app/sdk"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-medium shadow-sm transition-colors"
          >
            <span>SDK Setup</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* TOP STATISTICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Requests */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Total Requests</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">{stats?.total_events ?? events.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Ingested via SDK</p>
        </div>

        {/* Threats Detected */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Threats Detected</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 font-mono">{stats?.total_alerts ?? alerts.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Flagged by ML & Rules</p>
        </div>

        {/* Active Projects */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Active Projects</span>
            <Server className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">{projects.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">In organization</p>
        </div>

        {/* Risk Score */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Risk Score</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 font-mono">
            {stats?.max_anomaly_score ? Number(stats.max_anomaly_score).toFixed(2) : '1.00'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Isolation Forest baseline</p>
        </div>

        {/* Blocked IPs */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Blocked IPs</span>
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400 font-mono">{blockedIPs.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Automated rate limiter</p>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Over Time */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Traffic & Latency Over Time</h3>
              <p className="text-[10px] text-slate-400">Request throughput vs latency percentiles</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficChartData}>
                <defs>
                  <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#06b6d4" fillOpacity={1} fill="url(#reqGradient)" name="Requests" />
                <Area type="monotone" dataKey="anomalies" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} name="Anomalies" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attack Distribution */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Attack Distribution</h3>
            <p className="text-[10px] text-slate-400">Classified by detection heuristic</p>
          </div>
          <div className="h-64 flex items-center justify-center">
            {attackDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attackDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {attackDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-xs text-slate-500 py-12">No attack signatures recorded</div>
            )}
          </div>
        </div>
      </div>

      {/* THREAT GEOLOCATION MAP */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Threat Geolocation Map</h3>
            <p className="text-[10px] text-slate-400">Live plotting of incoming hostile request origins</p>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Leaflet v1.9 / OpenStreetMap</span>
        </div>
        <ThreatMap threats={alerts} />
      </div>

      {/* LIVE TABLES ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Event Feed Table */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Telemetry Feed</h3>
            </div>
            <Link to="/app/live" className="text-xs text-cyan-400 hover:underline inline-flex items-center space-x-1">
              <span>View full log</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Endpoint</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Latency</th>
                  <th className="py-2 px-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {events.slice(0, 8).map((ev, i) => (
                  <tr key={ev.id || i} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-bold text-cyan-400">{ev.method}</td>
                    <td className="py-2 px-3 text-slate-300 truncate max-w-[120px]">{ev.endpoint}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          ev.status_code >= 500
                            ? 'bg-rose-950 text-rose-400'
                            : ev.status_code >= 400
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-emerald-950 text-emerald-400'
                        }`}
                      >
                        {ev.status_code}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">{Math.round(ev.latency_ms || 10)}ms</td>
                    <td className="py-2 px-3 text-slate-500">{ev.ip || '127.0.0.1'}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 font-sans">
                      Waiting for incoming telemetry events...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Alerts & Threats Table */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Active Security Alerts</h3>
            </div>
            <Link to="/app/threats" className="text-xs text-cyan-400 hover:underline inline-flex items-center space-x-1">
              <span>View all</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Severity</th>
                  <th className="py-2 px-3">Attack Type</th>
                  <th className="py-2 px-3">Score</th>
                  <th className="py-2 px-3">Source IP</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.slice(0, 8).map((alt) => (
                  <tr key={alt.id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          alt.severity === 'critical' || alt.severity === 'high'
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                            : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {alt.severity || 'high'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-200">
                      {(alt.attack_type || 'Anomaly').replace('_', ' ')}
                    </td>
                    <td className="py-2 px-3 font-mono text-cyan-400">
                      {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(2) : alt.anomaly_score}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400">{alt.ip || alt.source_ip || '-'}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => navigate(`/app/investigations?alert_id=${alt.id}`)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 font-sans">
                      No security anomalies detected. System operating normally.
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
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Actively Blocked IP Addresses</h3>
            <span className="text-[10px] font-mono text-purple-400">{blockedIPs.length} addresses</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {blockedIPs.map((b) => (
              <div
                key={b.ip}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-mono text-white">{b.ip}</p>
                  <p className="text-[10px] text-slate-500 truncate">{b.reason || 'Rate limit threshold'}</p>
                </div>
                <button
                  onClick={() => handleUnblock(b.ip)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 text-[10px] font-medium transition-colors"
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
