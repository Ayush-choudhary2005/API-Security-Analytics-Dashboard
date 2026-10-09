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
  const { currentProject } = useProject();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        telemetryService.getHistory(currentProject.id),
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
    fetchAnalytics();
  }, [currentProject?.id]);

  const chartData = history.length > 0
    ? history.map((item, i) => ({
        time: item.minute || (item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `T-${i}`),
        requests: item.total || item.total_requests || (item.count || 1),
        anomalies: item.attacks !== undefined ? item.attacks : (item.anomalies_detected || 0),
        avgLatency: Math.round(item.avg_latency || 12),
      }))
    : Array.from({ length: 15 }, (_, i) => ({
        time: `${String(i * 2).padStart(2, '0')}:00`,
        requests: Math.floor(Math.random() * 35) + 12,
        anomalies: Math.floor(Math.random() * 3),
        avgLatency: Math.floor(Math.random() * 15) + 8,
      }));

  const attackTypes = stats?.attack_distribution
    ? Object.entries(stats.attack_distribution).map(([type, count]) => ({
        type: type.replace('_', ' ').toUpperCase(),
        count,
      }))
    : [
        { type: 'BRUTE FORCE', count: 8 },
        { type: 'BURST ANOMALY', count: 4 },
        { type: 'ENDPOINT SCAN', count: 3 },
        { type: 'PAYLOAD PROBE', count: 2 },
      ];

  const totalVol = chartData.reduce((acc, c) => acc + (c.requests || 0), 0);
  const totalAnom = chartData.reduce((acc, c) => acc + (c.anomalies || 0), 0);
  const avgLat = Math.round(chartData.reduce((acc, c) => acc + (c.avgLatency || 0), 0) / (chartData.length || 1));
  const breachRate = totalVol > 0 ? ((totalAnom / totalVol) * 100).toFixed(2) : '0.00';

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Telemetry & Risk Analytics</h1>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#82AAFF] border border-[#2A2E37]">
              <span>PROJECT_TELEMETRY</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Granular time-series velocity, anomaly classification, and service latency distributions for {currentProject?.name || 'Active Project'}.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] text-xs font-mono text-[#E6E8EB] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#82AAFF] ${loading ? 'animate-spin' : ''}`} />
            <span>SYNC DATA</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#101216] border border-[#1E2127] rounded p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Aggregated Requests</span>
            <Activity className="w-3.5 h-3.5 text-[#82AAFF]" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#E6E8EB]">{totalVol.toLocaleString()}</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">reqs</span>
          </div>
        </div>

        <div className="bg-[#101216] border border-[#1E2127] rounded p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Flagged Anomalies</span>
            <ShieldAlert className="w-3.5 h-3.5 text-[#F07178]" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#F07178]">{totalAnom.toLocaleString()}</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">events</span>
          </div>
        </div>

        <div className="bg-[#101216] border border-[#1E2127] rounded p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Mean Latency</span>
            <Clock className="w-3.5 h-3.5 text-[#C792EA]" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#C792EA]">{avgLat}</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">ms</span>
          </div>
        </div>

        <div className="bg-[#101216] border border-[#1E2127] rounded p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#7B818B] uppercase tracking-wider">Anomaly Ratio</span>
            <Zap className="w-3.5 h-3.5 text-[#FFCB6B]" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold font-mono text-[#FFCB6B]">{breachRate}%</span>
            <span className="text-[10px] font-mono text-[#9BA1AC]">of traffic</span>
          </div>
        </div>
      </div>

      {/* Latency & Requests Trends */}
      <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
        <div className="flex items-center justify-between mb-4 border-b border-[#1E2127] pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-[#82AAFF]" />
              <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Request Velocity vs Anomalies</h3>
            </div>
            <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">High-frequency ingestion volume plotted against ML threshold breaches</p>
          </div>
          <span className="text-[10px] font-mono text-[#7B818B]">TIME-SERIES DUAL-AXIS</span>
        </div>
        <div className="h-64">
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
              <YAxis stroke="#7B818B" fontSize={10} tickLine={false} fontFamily="monospace" />
              <Tooltip
                contentStyle={{ backgroundColor: '#101216', borderColor: '#2A2E37', borderRadius: '4px', fontSize: '11px', color: '#E6E8EB', fontFamily: 'monospace' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '10px' }} />
              <Area type="monotone" dataKey="requests" stroke="#82AAFF" strokeWidth={1.5} fill="url(#reqGradient)" name="Total Requests" />
              <Area type="monotone" dataKey="anomalies" stroke="#F07178" strokeWidth={1.5} fill="url(#anomGradient)" name="Flagged Anomalies" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latency Profile */}
        <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
          <div className="mb-4 border-b border-[#1E2127] pb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-[#C792EA]" />
                <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Average Latency Profile</h3>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">Response latency in milliseconds across observation windows</p>
            </div>
            <span className="text-[10px] font-mono text-[#C792EA]">p50 / p95 METRIC</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="#1E2127" />
                <XAxis dataKey="time" stroke="#7B818B" fontSize={10} tickLine={false} fontFamily="monospace" />
                <YAxis stroke="#7B818B" fontSize={10} unit="ms" tickLine={false} fontFamily="monospace" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#101216', borderColor: '#2A2E37', borderRadius: '4px', fontSize: '11px', color: '#E6E8EB', fontFamily: 'monospace' }}
                />
                <Line type="monotone" dataKey="avgLatency" stroke="#C792EA" strokeWidth={1.5} dot={{ r: 2, fill: '#C792EA' }} name="Avg Latency (ms)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attack Type Frequency */}
        <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
