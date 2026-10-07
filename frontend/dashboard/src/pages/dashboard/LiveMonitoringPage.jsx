import React, { useState, useEffect } from 'react';
import {
  Activity,
  Play,
  Pause,
  Trash2,
  Search,
  Filter,
  ArrowDownCircle,
  Radio,
  Server,
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
  const [autoScroll, setAutoScroll] = useState(true);

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Live Telemetry Monitor</h1>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              <Radio className={`w-3 h-3 ${!isPaused ? 'animate-pulse' : ''}`} />
              <span>{!isPaused ? 'STREAMING' : 'PAUSED'}</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time inspection of API transactions ingested from {currentProject?.name || 'project'}.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isPaused
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-amber-950/60 border-amber-800/80 text-amber-300 hover:bg-amber-900/60'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Resume Stream' : 'Pause Stream'}</span>
          </button>
          <button
            onClick={() => setEvents([])}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter by endpoint or IP..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="ALL">All Methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="ALL">All Status</option>
            <option value="2xx">2xx OK</option>
            <option value="4xx">4xx Client Error</option>
            <option value="5xx">5xx Server Error</option>
          </select>
        </div>
      </div>

      {/* Streaming Events Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4">Endpoint</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Latency</th>
                <th className="py-2.5 px-4">Payload</th>
                <th className="py-2.5 px-4">Source IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredEvents.map((ev, i) => (
                <tr key={ev.id || i} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-4 text-slate-400">
                    {ev.timestamp
                      ? new Date(ev.timestamp * 1000).toLocaleTimeString([], { hour12: false })
                      : 'Just now'}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-cyan-400">{ev.method}</td>
                  <td className="py-2.5 px-4 text-slate-200 font-sans">{ev.endpoint}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ev.status_code >= 500
                          ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                          : ev.status_code >= 400
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                          : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                      }`}
                    >
                      {ev.status_code}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{Math.round(ev.latency_ms || 10)}ms</td>
                  <td className="py-2.5 px-4 text-slate-500">{ev.payload_size || ev.size || 120} B</td>
                  <td className="py-2.5 px-4 text-slate-400">{ev.ip || '127.0.0.1'}</td>
                </tr>
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500 font-sans">
                    No matching events found in active stream buffer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-950/60 px-4 py-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-800/60">
          <span>Displaying {filteredEvents.length} transactions</span>
          <span className="font-mono">Real-time WebSocket transport</span>
        </div>
      </div>
    </div>
  );
};
