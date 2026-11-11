import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Target, Play, Square, ChevronDown, AlertTriangle } from 'lucide-react';
import { simulatorService } from '../services/api';

const ATTACK_TYPES = [
  {
    id: 'brute_force',
    label: 'Brute Force',
    desc: 'Fires repeated 401 login attempts from 192.0.2.1',
    icon: '🔑',
    counts: { low: 8, medium: 16, high: 30 },
  },
  {
    id: 'endpoint_scan',
    label: 'Endpoint Scan',
    desc: 'Probes unique 404 endpoints from 192.0.2.2',
    icon: '🔍',
    counts: { low: 18, medium: 26, high: 40 },
  },
  {
    id: 'request_burst',
    label: 'Request Burst',
    desc: 'Floods /api/products from 192.0.2.3 to trigger rate limits',
    icon: '💥',
    counts: { low: 33, medium: 40, high: 52 },
  },
];

const INTENSITIES = [
  { id: 'low', label: 'Low', dots: 1 },
  { id: 'medium', label: 'Medium', dots: 2 },
  { id: 'high', label: 'High', dots: 3 },
];

function IntensityDots({ level }) {
  return (
    <span className="flex gap-1 items-center">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            i <= level
              ? level === 3
                ? 'bg-red-400'
                : level === 2
                ? 'bg-yellow-400'
                : 'bg-green-400'
              : 'bg-[#2A2F3A]'
          }`}
        />
      ))}
    </span>
  );
}

export function RedTeamPanel({ projectId }) {
  const [open, setOpen] = useState(false);
  const [attackType, setAttackType] = useState('brute_force');
  const [intensity, setIntensity] = useState('medium');
  const [status, setStatus] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState(null);

  const pollRef = useRef(null);
  const activeProjectRef = useRef(projectId);

  const selectedAttack = ATTACK_TYPES.find((a) => a.id === attackType) || ATTACK_TYPES[0];

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (targetProjectId) => {
      stopPolling();
      if (!targetProjectId) return;
      pollRef.current = setInterval(async () => {
        try {
          const res = await simulatorService.getStatus(targetProjectId);
          if (activeProjectRef.current !== targetProjectId) {
            stopPolling();
            return;
          }
          setStatus(res.data);
          if (!res.data?.running) {
            stopPolling();
          }
        } catch {
          stopPolling();
        }
      }, 800);
    },
    [stopPolling]
  );

  // Sync status on mount or project change, and clean up interval on unmount
  useEffect(() => {
    activeProjectRef.current = projectId;
    stopPolling();
    setStatus(null);
    setError(null);
    setLaunching(false);

    if (!projectId) return () => stopPolling();

    let cancelled = false;
    simulatorService
      .getStatus(projectId)
      .then((res) => {
        if (cancelled || activeProjectRef.current !== projectId) return;
        const data = res.data;
        if (data && (data.running || data.started_at || data.finished_at)) {
          setStatus(data);
          if (data.running) {
            startPolling(projectId);
          }
        }
      })
      .catch(() => {
        // Ignore initial status errors (e.g., transient network)
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [projectId, startPolling, stopPolling]);

  const handleLaunch = async () => {
    if (!projectId || launching || status?.running) return;
    setError(null);
    setLaunching(true);
    const targetProjectId = projectId;
    const expectedTotal = selectedAttack.counts[intensity] ?? 0;

    try {
      await simulatorService.launch(targetProjectId, {
        attack_type: attackType,
        intensity,
      });
      if (activeProjectRef.current !== targetProjectId) return;
      setStatus({
        running: true,
        attack_type: attackType,
        intensity,
        requests_total: expectedTotal,
        requests_fired: 0,
        requests_failed: 0,
        alerts_fired: 0,
        auto_blocked: false,
      });
      startPolling(targetProjectId);
    } catch (e) {
      if (activeProjectRef.current !== targetProjectId) return;
      const msg = e?.response?.data?.error || 'Failed to launch simulation';
      setError(msg);
    } finally {
      if (activeProjectRef.current === targetProjectId) {
        setLaunching(false);
      }
    }
  };

  const isRunning = Boolean(status?.running);
  const hasFailed = Boolean(status?.error) || ((status?.requests_fired ?? 0) === 0 && (status?.requests_failed ?? 0) > 0);

  return (
    <div className="rounded-2xl border border-[#1E2127] hover:border-[#2A2E37] bg-[#101216] overflow-hidden transition-all duration-200 shadow-sm">
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#16181D] transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-[#F07178]" />
          <span className="text-xs font-mono font-semibold text-[#E6E8EB]">
            Red Team Simulator
          </span>
          <span className="text-[10px] px-1.5 py-0.5 bg-[#F07178]/10 text-[#F07178] border border-[#F07178]/30 rounded font-mono">
            BETA
          </span>
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              RUNNING ({status?.requests_fired ?? 0}/{status?.requests_total ?? 0})
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-[#9BA1AC] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="px-4 pb-4 border-t border-[#1E2127]">
          <p className="text-[10px] text-[#9BA1AC] font-mono mt-3 mb-4">
            Fire a controlled attack against your own project and watch the detection
            pipeline respond live. Events are tagged{' '}
            <span className="text-[#FFCB6B]">[SIM]</span> and excluded from analytics.
          </p>

          {/* Attack type picker */}
          <div className="mb-3">
            <label className="text-[10px] font-mono text-[#9BA1AC] uppercase tracking-widest block mb-2">
              Attack Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ATTACK_TYPES.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => !isRunning && setAttackType(a.id)}
                  disabled={isRunning}
                  className={`text-left p-2.5 rounded-xl border text-[10px] font-mono transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    attackType === a.id
                      ? 'border-[#F07178]/50 bg-[#F07178]/5 text-[#F07178]'
                      : 'border-[#2A2F3A] text-[#9BA1AC] hover:border-[#3A3F4A]'
                  }`}
                >
                  <div className="text-base mb-1">{a.icon}</div>
                  <div className="font-semibold">{a.label}</div>
                  <div className="text-[9px] text-[#7B818B] mt-0.5 leading-tight">
                    {a.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Intensity picker */}
          <div className="mb-4">
            <label className="text-[10px] font-mono text-[#9BA1AC] uppercase tracking-widest block mb-2">
              Intensity
            </label>
            <div className="flex flex-wrap gap-2">
              {INTENSITIES.map((iv) => {
                const reqCount = selectedAttack.counts[iv.id];
                return (
                  <button
                    type="button"
                    key={iv.id}
                    onClick={() => !isRunning && setIntensity(iv.id)}
                    disabled={isRunning}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-mono transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      intensity === iv.id
                        ? 'border-[#C792EA]/50 bg-[#C792EA]/5 text-[#C792EA]'
                        : 'border-[#2A2F3A] text-[#9BA1AC] hover:border-[#3A3F4A]'
                    }`}
                  >
                    <IntensityDots level={iv.dots} />
                    <span>{iv.label}</span>
                    <span className="text-[9px] text-[#7B818B]">({reqCount} req)</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Launch error */}
          {error && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-3">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Launch button */}
          <button
            type="button"
            onClick={handleLaunch}
            disabled={isRunning || launching || !projectId}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all ${
              isRunning || launching || !projectId
                ? 'bg-[#2A2F3A] text-[#7B818B] cursor-not-allowed'
                : 'bg-[#F07178]/90 hover:bg-[#F07178] text-[#0A0B0D] cursor-pointer'
            }`}
          >
            {isRunning ? (
              <>
                <Square size={12} /> Simulation Running...
              </>
            ) : launching ? (
              <>
                <Play size={12} /> Launching...
              </>
            ) : (
              <>
                <Play size={12} /> Launch Attack
              </>
            )}
          </button>

          {/* Live status */}
          {status && (
            <div className="mt-3 pt-3 border-t border-[#1E2127]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-[#16181D] border border-[#1E2127]">
                  <div className="text-sm font-bold font-mono text-[#82AAFF]">
                    {status.requests_fired ?? 0}
                    {status.requests_total ? (
                      <span className="text-[10px] text-[#7B818B]">/{status.requests_total}</span>
                    ) : null}
                  </div>
                  <div className="text-[9px] font-mono text-[#7B818B] uppercase">Requests</div>
                </div>

                <div className="p-2 rounded-xl bg-[#16181D] border border-[#1E2127]">
                  <div className="text-sm font-bold font-mono text-[#FFCB6B]">
                    {status.alerts_fired ?? 0}
                  </div>
                  <div className="text-[9px] font-mono text-[#7B818B] uppercase">Alerts Fired</div>
                </div>

                <div className="p-2 rounded-xl bg-[#16181D] border border-[#1E2127]">
                  <div
                    className={`text-sm font-bold font-mono ${
                      status.auto_blocked ? 'text-[#F07178]' : 'text-[#9BA1AC]'
                    }`}
                  >
                    {status.auto_blocked ? 'Yes' : 'No'}
                  </div>
                  <div className="text-[9px] font-mono text-[#7B818B] uppercase">Auto-Blocked</div>
                </div>

                <div className="p-2 rounded-xl bg-[#16181D] border border-[#1E2127]">
                  <div
                    className={`text-sm font-bold font-mono ${
                      status.running
                        ? 'text-red-400 animate-pulse'
                        : hasFailed
                        ? 'text-red-400'
                        : 'text-[#C3E88D]'
                    }`}
                  >
                    {status.running ? 'ACTIVE' : hasFailed ? 'FAILED' : 'DONE'}
                  </div>
                  <div className="text-[9px] font-mono text-[#7B818B] uppercase">Status</div>
                </div>
              </div>

              {!status.running && status.finished_at && !hasFailed && (
                <p className="text-[10px] font-mono text-[#C3E88D] text-center mt-2">
                  ✓ Complete ({status.attack_type?.replace(/_/g, ' ')}) — check Live Stream for [SIM] events
                </p>
              )}
              {status.error && (
                <p className="text-[10px] font-mono text-red-400 text-center mt-2">
                  ✗ {status.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
