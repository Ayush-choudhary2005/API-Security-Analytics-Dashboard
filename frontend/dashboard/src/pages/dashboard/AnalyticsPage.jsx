import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Activity,
  Zap,
  Clock,
  ShieldAlert,
  BarChart3,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { useProject } from '../../context/ProjectContext';
import { telemetryService } from '../../services/api';

export const AnalyticsPage = () => {
  const { currentOrg, currentProject, openCreateOrgModal, openCreateProjModal } = useProject();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('1h');

  const fetchAnalytics = async (range = timeRange) => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        telemetryService.getHistory(currentProject.id, range),
        telemetryService.getAlertStats(currentProject.id),
      ]);
      const hist = histRes.data;
      setHistory(Array.isArray(hist) ? hist : (hist?.timeline || hist?.history || []));
      setStats(statsRes.data || null);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(timeRange);
  }, [currentProject?.id]);

  const chartData = history.length > 0
    ? history.map((item) => ({
        time: item.minute || (item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
        timestamp: item.timestamp,
        requests: item.requests ?? item.total ?? item.count ?? 0,
        anomalies: item.anomalies ?? item.attacks ?? 0,
        avgLatency: Math.round(item.avg_latency ?? item.latency ?? 0),
        p95Latency: Math.round(item.p95_latency ?? item.avg_latency ?? 0),
      }))
    : [];

  const rawDist = stats?.attack_distribution || (stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : null);
  const attackTypes = rawDist
    ? Object.entries(rawDist)
        .filter(([key, count]) => count > 0 && key !== 'attack_distribution')
        .map(([type, count]) => ({
          type: type.replace(/_/g, ' ').toUpperCase(),
          count,
        }))
    : [];

  const totalVol = chartData.reduce((acc, c) => acc + (c.requests || 0), 0);
  const totalAnom = chartData.reduce((acc, c) => acc + (c.anomalies || 0), 0);
  const weightedLatencySum = chartData.reduce((acc, c) => acc + ((c.avgLatency || 0) * (c.requests || 0)), 0);
  const avgLat = totalVol > 0 ? Math.round(weightedLatencySum / totalVol) : 0;
  const breachRate = totalVol > 0 ? ((totalAnom / totalVol) * 100).toFixed(2) : '0.00';

  if (!currentProject) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-3xl p-8 max-w-xl mx-auto mt-8 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-[#82AAFF]/10 border border-[#82AAFF]/30 flex items-center justify-center mx-auto text-[#82AAFF]">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Project Selected</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Create or select a project to inspect aggregate telemetry velocity, anomaly breakdown, and latency distribution.
        </p>
        <div className="pt-2">
          {currentOrg ? (
            <button
              onClick={openCreateProjModal}
              className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-full bg-[#82AAFF] hover:bg-[#9bbefc] text-xs text-[#0A0B0D] font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
            >
              <span>Create Project</span>
            </button>
          ) : (
            <button
              onClick={openCreateOrgModal}
              className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-full bg-[#C792EA] hover:bg-[#d6a5f7] text-xs text-[#0A0B0D] font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
            >
              <span>Create Workspace First</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Telemetry & Risk Analytics</h1>
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#16181D] text-[#82AAFF] border border-[#2A2E37]">
              <span>PROJECT_TELEMETRY</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Granular time-series velocity, anomaly classification, and service latency distributions for {currentProject?.name || 'Active Project'}.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Time Window Selector */}
          <div className="flex items-center space-x-1 bg-[#101216] border border-[#1E2127] p-1 rounded-full">
            {['30m', '1h', '6h', '24h', '7d'].map((r) => (
              <button
                key={r}
                onClick={() => {
                  setTimeRange(r);
                  fetchAnalytics(r);
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-mono font-medium transition-all ${
                  timeRange === r
                    ? 'bg-[#C792EA] text-[#0A0B0D] font-bold shadow-xs'
                    : 'text-[#7B818B] hover:text-[#E6E8EB] hover:bg-[#16181D]'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchAnalytics(timeRange)}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] hover:border-[#2A2E37] text-xs font-mono text-[#E6E8EB] transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#82AAFF] ${loading ? 'animate-spin' : ''}`} />
            <span>SYNC DATA</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#82AAFF]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Aggregated Requests</span>
            <Activity className="w-3.5 h-3.5 text-[#82AAFF]" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#E6E8EB]">{totalVol.toLocaleString()}</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">reqs</span>
          </div>
        </div>

        <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#F07178]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Flagged Anomalies</span>
            <ShieldAlert className="w-3.5 h-3.5 text-[#F07178]" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#F07178]">{totalAnom.toLocaleString()}</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">events</span>
          </div>
        </div>

        <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#C792EA]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Mean Latency</span>
            <Clock className="w-3.5 h-3.5 text-[#C792EA]" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#C792EA]">{avgLat}</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">ms</span>
          </div>
        </div>

        <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFCB6B]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Anomaly Ratio</span>
            <Zap className="w-3.5 h-3.5 text-[#FFCB6B]" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#FFCB6B]">{breachRate}%</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">of traffic</span>
          </div>
        </div>
      </div>

      {/* Latency & Requests Trends */}
      <div className="p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-[#1E2127] pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-[#82AAFF]" />
              <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Request Velocity vs Anomalies</h3>
            </div>
            <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">High-frequency ingestion volume plotted against ML threshold breaches</p>
          </div>
          <span className="text-[10px] font-mono text-[#7B818B] bg-[#16181D] border border-[#1E2127] px-2.5 py-0.5 rounded-full">TIME-SERIES DUAL-AXIS</span>
        </div>
        <div className="h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82AAFF" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#82AAFF" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="anomGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F07178" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F07178" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" stroke="#1E2127" />
                <XAxis dataKey="time" stroke="#7B818B" fontSize={10} tickLine={false} fontFamily="monospace" />
                <YAxis yAxisId="requests" stroke="#82AAFF" fontSize={10} tickLine={false} fontFamily="monospace" allowDecimals={false} />
                <YAxis yAxisId="anomalies" orientation="right" stroke="#F07178" fontSize={10} tickLine={false} fontFamily="monospace" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#16181D', borderColor: '#2A2E37', borderRadius: '12px', fontSize: '11px', color: '#E6E8EB', fontFamily: 'monospace' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '10px' }} />
                <Area yAxisId="requests" type="monotone" dataKey="requests" stroke="#82AAFF" strokeWidth={1.5} fill="url(#reqGradient)" name="Total Requests (Left Axis)" />
                <Area yAxisId="anomalies" type="monotone" dataKey="anomalies" stroke="#F07178" strokeWidth={1.5} fill="url(#anomGradient)" name="Flagged Anomalies (Right Axis)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <BarChart3 className="w-7 h-7 text-[#7B818B] mb-2 opacity-50" />
              <p className="text-xs text-[#E6E8EB] font-medium">No Historical Traffic Data</p>
              <p className="text-[11px] text-[#9BA1AC] max-w-xs mt-1">
                Telemetry sent from your configured SDK will generate request volume trends and anomaly spikes here.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latency Profile */}
        <div className="p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 shadow-sm">
          <div className="mb-4 border-b border-[#1E2127] pb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-[#C792EA]" />
                <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Average & p95 Latency Profile</h3>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">Mean response latency vs 95th percentile spike latency across observation windows</p>
            </div>
            <span className="text-[10px] font-mono text-[#C792EA] bg-[#16181D] border border-[#1E2127] px-2.5 py-0.5 rounded-full">AVG / p95 METRIC</span>
          </div>
          <div className="h-60">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#1E2127" />
                  <XAxis dataKey="time" stroke="#7B818B" fontSize={10} tickLine={false} fontFamily="monospace" />
                  <YAxis stroke="#7B818B" fontSize={10} unit="ms" tickLine={false} fontFamily="monospace" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16181D', borderColor: '#2A2E37', borderRadius: '12px', fontSize: '11px', color: '#E6E8EB', fontFamily: 'monospace' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
                  <Line type="monotone" dataKey="avgLatency" stroke="#82AAFF" strokeWidth={1.5} dot={false} name="Avg Latency (ms)" />
                  <Line type="monotone" dataKey="p95Latency" stroke="#C792EA" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="p95 Latency (ms)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <Clock className="w-7 h-7 text-[#7B818B] mb-2 opacity-50" />
                <p className="text-xs text-[#E6E8EB] font-medium">No Latency Measurements</p>
                <p className="text-[11px] text-[#9BA1AC] max-w-xs mt-1">
                  Latency distributions will display here once transactions begin streaming.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Attack Type Frequency */}
        <div className="p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 shadow-sm">
          <div className="mb-4 border-b border-[#1E2127] pb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[#FFCB6B]" />
                <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Attack Category Breakdown</h3>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">Cumulative count of flagged signatures</p>
            </div>
            <span className="text-[10px] font-mono text-[#FFCB6B]">CLASSIFIER HISTOGRAM</span>
          </div>
          <div className="h-60">
            {attackTypes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attackTypes} layout="vertical">
                  <CartesianGrid strokeDasharray="2 2" stroke="#1E2127" />
                  <XAxis type="number" stroke="#7B818B" fontSize={10} tickLine={false} fontFamily="monospace" />
                  <YAxis dataKey="type" type="category" stroke="#7B818B" fontSize={9} width={110} tickLine={false} fontFamily="monospace" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#101216', borderColor: '#2A2E37', borderRadius: '4px', fontSize: '11px', color: '#E6E8EB', fontFamily: 'monospace' }}
                  />
                  <Bar dataKey="count" fill="#C3E88D" radius={[0, 2, 2, 0]} name="Occurrences" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <Layers className="w-7 h-7 text-[#7B818B] mb-2 opacity-50" />
                <p className="text-xs text-[#E6E8EB] font-medium">Zero Hostile Signatures</p>
                <p className="text-[11px] text-[#9BA1AC] max-w-xs mt-1">
                  No attack vectors or heuristic threshold triggers identified for this project scope.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
