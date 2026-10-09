import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Search,
  Activity,
  Terminal,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { telemetryService } from '../../services/api';
import { getSocket } from '../../services/socket';

export const LiveMonitoringPage = () => {
  const { currentProject } = useProject();
  const [events, setEvents] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Initial fetch
  useEffect(() => {
    if (!currentProject?.id) return;
    telemetryService
      .getRecentEvents(currentProject.id, 50)
      .then((res) => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw?.events || []);
        setEvents(list);
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
      }
    };

    socket.on('new_event', onNewEvent);
    return () => {
      socket.off('new_event', onNewEvent);
    };
  }, [currentProject?.id, isPaused]);

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

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Live Telemetry Ingestion</h1>
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#E6E8EB] border border-[#2A2E37]">
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
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded border text-xs font-mono font-medium transition-colors ${
              isPaused
                ? 'bg-[#C3E88D] text-[#0A0B0D] font-semibold border-[#C3E88D] hover:bg-[#d4f2a7]'
                : 'bg-[#16181D] border-[#1E2127] text-[#E6E8EB] hover:bg-[#1E2127]'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}</span>
          </button>
          <button
            onClick={() => setEvents([])}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] text-xs font-mono text-[#9BA1AC] hover:text-[#E6E8EB] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR BUFFER</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3 rounded bg-[#101216] border border-[#1E2127] flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-[#7B818B] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search endpoint path, IP, or method..."
            className="w-full bg-[#16181D] border border-[#1E2127] rounded pl-8 pr-3 py-1.5 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-[#16181D] border border-[#1E2127] rounded px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
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
            className="bg-[#16181D] border border-[#1E2127] rounded px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none focus:border-[#C792EA] font-mono transition-colors"
          >
            <option value="ALL">STATUS: ALL</option>
            <option value="2xx">2xx SUCCESS</option>
            <option value="4xx">4xx CLIENT ERR</option>
            <option value="5xx">5xx SERVER ERR</option>
          </select>
        </div>
      </div>

      {/* Streaming Events Table */}
      <div className="rounded bg-[#101216] border border-[#1E2127] overflow-hidden">
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
