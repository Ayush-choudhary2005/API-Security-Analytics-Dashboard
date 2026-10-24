import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Search,
  Activity,
  Zap,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useProject } from '../../context/ProjectContext';
import { telemetryService } from '../../services/api';
import { getSocket } from '../../services/socket';

export const LiveMonitoringPage = () => {
  const { currentOrg, currentProject, openCreateOrgModal, openCreateProjModal } = useProject();
  const [events, setEvents] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Rolling 60-second telemetry pulse buffer
  const [streamBuffer, setStreamBuffer] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: 60 }, (_, idx) => {
      const epoch = now - (59 - idx);
      const d = new Date(epoch * 1000);
      return {
        epoch,
        time: d.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
        latency: 0,
        requests: 0,
        errors: 0,
      };
    });
  });

  // Ref tracking event queue for 1-FPS chart ticks
  const rawEventsQueueRef = useRef([]);

  // Initial fetch
  useEffect(() => {
    if (!currentProject?.id) return;
    telemetryService
      .getRecentEvents(currentProject.id, 50)
      .then((res) => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw?.events || []);
        setEvents(list);

        // Pre-populate rawEventsQueue with existing recent events
        const now = Math.floor(Date.now() / 1000);
        const mapped = list.map((ev) => ({
          epoch: ev.timestamp ? Math.floor(ev.timestamp) : now,
          latency: Number(ev.latency_ms || 15),
          isError: Number(ev.status_code || 200) >= 400,
        }));
        rawEventsQueueRef.current = mapped;
      })
      .catch((err) => console.error('Failed to load initial events:', err));
  }, [currentProject?.id]);

  // WebSocket live streaming
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentProject?.id) return;

    const onNewEvent = (ev) => {
      if (!isPaused) {
        setEvents((prev) => [ev, ...prev.slice(0, 99)]);

        // Push into rolling event queue
        rawEventsQueueRef.current.push({
          epoch: Math.floor(Date.now() / 1000),
          latency: Number(ev.latency_ms || 15),
          isError: Number(ev.status_code || 200) >= 400,
        });
      }
    };

    socket.on('new_event', onNewEvent);
    return () => {
      socket.off('new_event', onNewEvent);
    };
  }, [currentProject?.id, isPaused]);

  // 1-FPS EKG ticker: shifts window every 1 second and computes stats for each second
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - 65; // keep last 65s of raw events
      rawEventsQueueRef.current = rawEventsQueueRef.current.filter((e) => e.epoch >= cutoff);

      // Group raw events by epoch second
      const bucketMap = new Map();
      rawEventsQueueRef.current.forEach((e) => {
        const bucket = bucketMap.get(e.epoch) || { count: 0, totalLat: 0, errors: 0 };
        bucket.count += 1;
        bucket.totalLat += e.latency;
        if (e.isError) bucket.errors += 1;
        bucketMap.set(e.epoch, bucket);
      });

      // Generate 60 seconds of contiguous timeline
      const newBuffer = [];
      for (let i = 59; i >= 0; i--) {
        const epoch = now - i;
        const d = new Date(epoch * 1000);
        const b = bucketMap.get(epoch);
        newBuffer.push({
          epoch,
          time: d.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
          requests: b ? b.count : 0,
          latency: b && b.count > 0 ? Math.round(b.totalLat / b.count) : 0,
          errors: b ? b.errors : 0,
        });
      }

      setStreamBuffer(newBuffer);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused]);

  // Derived live KPI stats over the 60-second window
  const liveStats = useMemo(() => {
    const totalRequests = streamBuffer.reduce((sum, b) => sum + b.requests, 0);
    const totalErrors = streamBuffer.reduce((sum, b) => sum + b.errors, 0);
    const activeBuckets = streamBuffer.filter((b) => b.requests > 0);
    const avgLatency =
      activeBuckets.length > 0
        ? Math.round(
            activeBuckets.reduce((sum, b) => sum + b.latency * b.requests, 0) / totalRequests
          )
        : 0;
    const peakLatency = streamBuffer.reduce((max, b) => Math.max(max, b.latency), 0);
    const currentTps = streamBuffer[streamBuffer.length - 1]?.requests || 0;
    const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : '0.0';

    return { totalRequests, currentTps, avgLatency, peakLatency, errorRate };
  }, [streamBuffer]);

  const filteredEvents = events.filter((ev) => {
    const matchSearch =
      !searchTerm ||
      ev.endpoint?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.ip?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.method?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchMethod = methodFilter === 'ALL' || ev.method?.toUpperCase() === methodFilter;

    let matchStatus = true;
    if (statusFilter === '2xx') matchStatus = ev.status_code >= 200 && ev.status_code < 300;
    if (statusFilter === '4xx') matchStatus = ev.status_code >= 400 && ev.status_code < 500;
    if (statusFilter === '5xx') matchStatus = ev.status_code >= 500;

    return matchSearch && matchMethod && matchStatus;
  });

  if (!currentProject) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-3xl p-8 max-w-xl mx-auto mt-8 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-[#82AAFF]/10 border border-[#82AAFF]/30 flex items-center justify-center mx-auto text-[#82AAFF]">
          <Activity className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Project Selected</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Select or create a project to listen to live websocket telemetry and API transaction streams.
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
              <span>Create Workspace</span>
            </button>
          )}
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
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Live Telemetry Ingestion</h1>
            <span className="inline-flex items-center space-x-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono bg-[#16181D] text-[#E6E8EB] border border-[#2A2E37]">
              <span className={`w-1.5 h-1.5 rounded-full ${!isPaused ? 'bg-[#C3E88D] animate-pulse shadow-[0_0_6px_rgba(195,232,141,0.8)]' : 'bg-[#7B818B]'}`}></span>
              <span>{!isPaused ? 'STREAM: ACTIVE' : 'STREAM: PAUSED'}</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Direct socket stream for target project <span className="text-[#82AAFF]">{currentProject?.name || 'project'}</span> ({currentProject?.id?.slice(0, 8) || 'scope'}).
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full border text-xs font-mono font-medium transition-all duration-200 hover:-translate-y-0.5 shadow-xs ${
              isPaused
                ? 'bg-[#C3E88D] text-[#0A0B0D] font-semibold border-[#C3E88D] hover:bg-[#d4f2a7]'
                : 'bg-[#16181D] border-[#1E2127] hover:border-[#2A2E37] text-[#E6E8EB] hover:bg-[#1E2127]'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}</span>
          </button>
          <button
            onClick={() => {
              setEvents([]);
              rawEventsQueueRef.current = [];
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] hover:border-[#2A2E37] text-xs font-mono text-[#9BA1AC] hover:text-[#E6E8EB] transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR BUFFER</span>
          </button>
        </div>
      </div>

      {/* Real-time 1-FPS EKG Telemetry Pulse Panel */}
      <div className="rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2127]/60 pb-3">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#82AAFF] animate-ping"></span>
            <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-[#E6E8EB]">
              Real-Time EKG Pulse (60s Rolling Window)
            </h2>
          </div>
          <div className="flex items-center space-x-2 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded bg-[#16181D] border border-[#1E2127] text-[#82AAFF]">
              ● LATENCY (ms)
            </span>
            <span className="px-2 py-0.5 rounded bg-[#16181D] border border-[#1E2127] text-[#C3E88D]">
              ● THROUGHPUT (req/s)
            </span>
            <span className="px-2 py-0.5 rounded bg-[#16181D] border border-[#1E2127] text-[#9BA1AC]">
              1-FPS TICK
            </span>
          </div>
        </div>

        {/* 4 Mini KPI Telemetry Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-[#16181D] border border-[#1E2127]">
            <div className="flex items-center justify-between text-[#7B818B] text-[10px] font-mono uppercase">
              <span>Current TPS</span>
              <Zap className="w-3 h-3 text-[#C3E88D]" />
            </div>
            <div className="text-base font-bold font-mono text-[#E6E8EB] mt-1">
              {liveStats.currentTps} <span className="text-[10px] font-normal text-[#9BA1AC]">req/s</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[#16181D] border border-[#1E2127]">
            <div className="flex items-center justify-between text-[#7B818B] text-[10px] font-mono uppercase">
              <span>60s Avg Latency</span>
              <Clock className="w-3 h-3 text-[#82AAFF]" />
            </div>
            <div className="text-base font-bold font-mono text-[#82AAFF] mt-1">
              {liveStats.avgLatency} <span className="text-[10px] font-normal text-[#9BA1AC]">ms</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[#16181D] border border-[#1E2127]">
            <div className="flex items-center justify-between text-[#7B818B] text-[10px] font-mono uppercase">
              <span>60s Peak Latency</span>
              <Activity className="w-3 h-3 text-[#FFCB6B]" />
            </div>
            <div className="text-base font-bold font-mono text-[#FFCB6B] mt-1">
              {liveStats.peakLatency} <span className="text-[10px] font-normal text-[#9BA1AC]">ms</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[#16181D] border border-[#1E2127]">
            <div className="flex items-center justify-between text-[#7B818B] text-[10px] font-mono uppercase">
              <span>60s Error Rate</span>
              <ShieldAlert className="w-3 h-3 text-[#F07178]" />
            </div>
            <div className="text-base font-bold font-mono text-[#F07178] mt-1">
              {liveStats.errorRate}%
            </div>
          </div>
        </div>

        {/* EKG Live Oscilloscope Chart */}
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={streamBuffer} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ekgLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#82AAFF" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#82AAFF" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E2127" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#7B818B"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                interval={11}
              />
              <YAxis
                yAxisId="latency"
                stroke="#82AAFF"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                unit="ms"
                domain={[0, 'auto']}
              />
              <YAxis
                yAxisId="requests"
                orientation="right"
                stroke="#C3E88D"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#101216',
                  borderColor: '#2A2E37',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              />
              <Area
                yAxisId="latency"
                type="monotone"
                dataKey="latency"
                name="Avg Latency (ms)"
                stroke="#82AAFF"
                strokeWidth={1.8}
                fill="url(#ekgLatencyGrad)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="requests"
                type="stepAfter"
                dataKey="requests"
                name="Throughput (req/s)"
                stroke="#C3E88D"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-[#7B818B] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search endpoint path, IP, or method..."
            className="w-full bg-[#16181D] border border-[#1E2127] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-[#16181D] border border-[#1E2127] rounded-xl px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          >
            <option value="ALL">METHOD: ALL</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#16181D] border border-[#1E2127] rounded-xl px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          >
            <option value="ALL">STATUS: ALL</option>
            <option value="2xx">2xx SUCCESS</option>
            <option value="4xx">4xx CLIENT ERR</option>
            <option value="5xx">5xx SERVER ERR</option>
          </select>
        </div>
      </div>

      {/* Streaming Events Table */}
      <div className="rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#16181D] text-[#7B818B] text-[10px] uppercase border-b border-[#1E2127]">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Method</th>
                <th className="py-2.5 px-3">Endpoint Path</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Latency</th>
                <th className="py-2.5 px-3">Payload Size</th>
                <th className="py-2.5 px-3">Client IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2127]/60">
              {filteredEvents.map((ev, i) => (
                <tr key={ev.id || i} className="hover:bg-[#16181D]/60 transition-colors">
                  <td className="py-2 px-3 text-[#7B818B] whitespace-nowrap">
                    {ev.timestamp
                      ? new Date(ev.timestamp * 1000).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 2 })
                      : 'Just now'}
                  </td>
                  <td className="py-2 px-3 font-bold">
                    <span className={
                      ev.method === 'GET' ? 'text-[#C3E88D]' :
                      ev.method === 'POST' ? 'text-[#82AAFF]' :
                      ev.method === 'PUT' ? 'text-[#FFCB6B]' : 'text-[#F07178]'
                    }>
                      {ev.method}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#E6E8EB] font-sans truncate max-w-[200px]">{ev.endpoint}</td>
                  <td className="py-2 px-3">
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
                  <td className="py-2 px-3 text-[#9BA1AC]">
                    <span className={
                      ev.latency_ms > 500 ? 'text-[#F07178]' :
                      ev.latency_ms > 150 ? 'text-[#FFCB6B]' : 'text-[#9BA1AC]'
                    }>
                      {Math.round(ev.latency_ms || 10)}ms
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#7B818B]">{ev.payload_size || ev.size || 128} B</td>
                  <td className="py-2 px-3 text-[#82AAFF]">{ev.ip || '127.0.0.1'}</td>
                </tr>
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#7B818B] font-mono">
                    No matching transactions in active telemetry ring buffer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-[#16181D] px-3.5 py-2 text-[10px] font-mono text-[#7B818B] flex items-center justify-between border-t border-[#1E2127]">
          <span>RING_BUFFER: {filteredEvents.length} / 100 TRANSACTIONS</span>
          <span className="text-[#C3E88D]">TRANSPORT: WS_PROTOCOL_V4 (REALTIME)</span>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitoringPage;
