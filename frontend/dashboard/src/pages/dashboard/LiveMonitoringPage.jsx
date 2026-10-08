import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Search,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-white tracking-tight">Live Telemetry Monitor</h1>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
              <span className={`w-1.5 h-1.5 rounded-full ${!isPaused ? 'bg-white' : 'bg-zinc-500'}`}></span>
              <span>{!isPaused ? 'STREAMING' : 'PAUSED'}</span>
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time inspection of API transactions ingested from {currentProject?.name || 'project'}.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
              isPaused
                ? 'bg-white text-black font-semibold border-white hover:bg-zinc-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Resume Stream' : 'Pause Stream'}</span>
          </button>
          <button
            onClick={() => setEvents([])}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter by endpoint or IP..."
            className="w-full bg-black border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-black border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-white font-mono transition-colors"
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
            className="bg-black border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-white font-mono transition-colors"
          >
            <option value="ALL">All Status</option>
            <option value="2xx">2xx OK</option>
            <option value="4xx">4xx Client Error</option>
            <option value="5xx">5xx Server Error</option>
          </select>
        </div>
      </div>

      {/* Streaming Events Table */}
      <div className="rounded bg-zinc-950 border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
              <tr>
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Method</th>
                <th className="py-2 px-3">Endpoint</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Latency</th>
                <th className="py-2 px-3">Payload</th>
                <th className="py-2 px-3">Source IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredEvents.map((ev, i) => (
                <tr key={ev.id || i} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="py-2 px-3 text-zinc-400">
                    {ev.timestamp
                      ? new Date(ev.timestamp * 1000).toLocaleTimeString([], { hour12: false })
                      : 'Just now'}
                  </td>
                  <td className="py-2 px-3 font-bold text-white">{ev.method}</td>
                  <td className="py-2 px-3 text-zinc-200 font-sans">{ev.endpoint}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        ev.status_code >= 500
                          ? 'bg-zinc-800 text-white border border-zinc-700'
                          : ev.status_code >= 400
                          ? 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                          : 'bg-black text-zinc-400 border border-zinc-800'
                      }`}
                    >
                      {ev.status_code}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-zinc-400">{Math.round(ev.latency_ms || 10)}ms</td>
                  <td className="py-2 px-3 text-zinc-400">{ev.payload_size || ev.size || 120} B</td>
                  <td className="py-2 px-3 text-zinc-400">{ev.ip || '127.0.0.1'}</td>
                </tr>
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-zinc-500 font-sans">
                    No matching events found in active stream buffer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-zinc-900 px-3 py-1.5 text-[10px] text-zinc-400 flex items-center justify-between border-t border-zinc-800">
          <span>Displaying {filteredEvents.length} transactions</span>
          <span className="font-mono">Real-time WebSocket transport</span>
        </div>
      </div>
    </div>
  );
};
