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

const SEVERITY_COLORS = {
  critical: '#f43f5e',
  high: '#f87171',
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

  const attackDistribution = stats?.attack_distribution
    ? Object.entries(stats.attack_distribution).map(([type, count]) => ({
        name: type.replace('_', ' ').toUpperCase(),
        value: count,
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
      <div className="py-16 text-center space-y-3">
        <Server className="w-10 h-10 mx-auto text-slate-500" />
        <h2 className="text-base font-semibold text-white">No Project Selected</h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Create or select a project from the top navigation to view security telemetry.
        </p>
        <Link
          to="/app/projects"
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-xs text-white font-medium transition-colors"
        >
          <span>Go to Projects</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-white tracking-tight">{currentProject.name}</h1>
            <span className="text-[10px] font-mono text-slate-400 bg-[#0e1420] border border-slate-800 px-1.5 py-0.5 rounded">
              {currentProject.id}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time API anomaly scoring and active defense telemetry stream.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-[#0e1420] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/app/sdk"
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-xs text-white font-medium transition-colors"
          >
            <span>SDK Setup</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* TOP UNIFIED METRICS STRIP */}
      <div className="bg-[#0e1420] border border-slate-800 rounded-md grid grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">Total Requests</span>
          <p className="text-xl font-bold text-white font-mono">{stats?.total_events ?? events.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Ingested via SDK</p>
        </div>

        <div className="p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">Threats Detected</span>
          <p className="text-xl font-bold text-rose-400 font-mono">{stats?.total_alerts ?? alerts.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Flagged by ML & Rules</p>
        </div>

        <div className="p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">Active Projects</span>
          <p className="text-xl font-bold text-white font-mono">{projects.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">In organization</p>
        </div>

        <div className="p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">Risk Score</span>
          <p className="text-xl font-bold text-amber-400 font-mono">
            {stats?.max_anomaly_score ? Number(stats.max_anomaly_score).toFixed(2) : '1.00'}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Isolation Forest max</p>
        </div>

        <div className="p-3.5 sm:p-4 col-span-2 lg:col-span-1">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">Blocked IPs</span>
          <p className="text-xl font-bold text-purple-400 font-mono">{blockedIPs.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Active firewall rules</p>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Traffic Over Time */}
        <div className="lg:col-span-2 p-4 rounded-md bg-[#0e1420] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Traffic & Latency</h3>
              <p className="text-[11px] text-slate-400">Request throughput vs latency percentiles</p>
            </div>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficChartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0e1420', borderColor: '#1e293b', borderRadius: '4px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#38bdf8" strokeWidth={1.5} fill="#38bdf8" fillOpacity={0.05} name="Requests" />
                <Area type="monotone" dataKey="anomalies" stroke="#f43f5e" strokeWidth={1.5} fill="#f43f5e" fillOpacity={0.15} name="Anomalies" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attack Distribution */}
        <div className="p-4 rounded-md bg-[#0e1420] border border-slate-800">
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Attack Distribution</h3>
            <p className="text-[11px] text-slate-400">Classified by detection heuristic</p>
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
                    contentStyle={{ backgroundColor: '#0e1420', borderColor: '#1e293b', borderRadius: '4px', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-xs text-slate-400 py-12">No attack signatures recorded</div>
            )}
          </div>
        </div>
      </div>

      {/* THREAT GEOLOCATION MAP */}
      <div className="p-4 rounded-md bg-[#0e1420] border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Threat Geolocation Map</h3>
            <p className="text-[11px] text-slate-400">Live plotting of incoming hostile request origins</p>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Leaflet v1.9 / OpenStreetMap</span>
        </div>
        <ThreatMap threats={alerts} />
      </div>

      {/* LIVE TABLES ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Event Feed Table */}
        <div className="p-4 rounded-md bg-[#0e1420] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Live Telemetry Feed</h3>
            </div>
            <Link to="/app/live" className="text-xs text-sky-400 hover:underline inline-flex items-center space-x-1">
              <span>View full log</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-2.5">Method</th>
                  <th className="py-1.5 px-2.5">Endpoint</th>
                  <th className="py-1.5 px-2.5">Status</th>
                  <th className="py-1.5 px-2.5">Latency</th>
                  <th className="py-1.5 px-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {events.slice(0, 8).map((ev, i) => (
                  <tr key={ev.id || i} className="hover:bg-slate-800/40">
                    <td className="py-1.5 px-2.5 font-bold text-sky-400">{ev.method}</td>
                    <td className="py-1.5 px-2.5 text-slate-300 truncate max-w-[120px]">{ev.endpoint}</td>
                    <td className="py-1.5 px-2.5">
                      <span
                        className={`px-1 py-0.5 rounded text-[10px] ${
                          ev.status_code >= 500
                            ? 'bg-rose-950/60 text-rose-400'
                            : ev.status_code >= 400
                            ? 'bg-amber-950/60 text-amber-400'
                            : 'bg-emerald-950/60 text-emerald-400'
                        }`}
                      >
                        {ev.status_code}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 text-slate-400">{Math.round(ev.latency_ms || 10)}ms</td>
                    <td className="py-1.5 px-2.5 text-slate-400">{ev.ip || '127.0.0.1'}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400 font-sans">
                      Waiting for incoming telemetry events...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Alerts & Threats Table */}
        <div className="p-4 rounded-md bg-[#0e1420] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Active Security Alerts</h3>
            </div>
            <Link to="/app/threats" className="text-xs text-sky-400 hover:underline inline-flex items-center space-x-1">
              <span>View all</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-2.5">Severity</th>
                  <th className="py-1.5 px-2.5">Attack Type</th>
                  <th className="py-1.5 px-2.5">Score</th>
                  <th className="py-1.5 px-2.5">Source IP</th>
                  <th className="py-1.5 px-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.slice(0, 8).map((alt) => (
                  <tr key={alt.id} className="hover:bg-slate-800/40">
                    <td className="py-1.5 px-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase font-mono ${
                          alt.severity === 'critical' || alt.severity === 'high'
                            ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                            : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
                        }`}
                      >
                        {alt.severity || 'high'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 font-medium text-slate-200">
                      {(alt.attack_type || 'Anomaly').replace('_', ' ')}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-sky-400">
                      {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(2) : alt.anomaly_score}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-slate-400">{alt.ip || alt.source_ip || '-'}</td>
                    <td className="py-1.5 px-2.5 text-right">
                      <button
                        onClick={() => navigate(`/app/investigations?alert_id=${alt.id}`)}
                        className="text-[11px] text-sky-400 hover:text-sky-300 font-medium hover:underline"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400 font-sans">
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
        <div className="p-4 rounded-md bg-[#0e1420] border border-slate-800">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Actively Blocked IP Addresses</h3>
            <span className="text-[10px] font-mono text-purple-400">{blockedIPs.length} addresses</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {blockedIPs.map((b) => (
              <div
                key={b.ip}
                className="p-2.5 rounded bg-[#090d16] border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-mono text-white text-[11px]">{b.ip}</p>
                  <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{b.reason || 'Rate limit threshold'}</p>
                </div>
                <button
                  onClick={() => handleUnblock(b.ip)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 text-[10px] font-medium transition-colors"
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
