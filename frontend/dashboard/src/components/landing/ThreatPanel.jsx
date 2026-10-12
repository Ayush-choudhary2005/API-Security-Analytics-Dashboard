import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ArrowRight,
  Radio,
  Lock,
  Cpu,
  Zap,
} from 'lucide-react';
import { FloatingToast } from './FloatingToast';

/**
 * ThreatPanel
 * Real-Time Telemetry & Machine Learning Defense Card tailored for API-Security-Analytics-Dashboard:
 * - Live request anomalies flagged across host project endpoints
 * - Project-native threat vectors: Brute-Force Auth (BF), Endpoint Fuzzing / Probing (EF), Volumetric Burst (VS)
 * - Calibrated Hybrid Isolation Forest anomaly score & fail-open status
 * - Subtle live data updates every ~3s simulating WebSocket telemetry events
 * - 3D card tilt & cursor-following radial glow
 */
export const ThreatPanel = () => {
  const cardRef = useRef(null);

  // Motion preference detection
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 3D tilt & mouse spotlight state
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [spotlight, setSpotlight] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e) => {
    if (prefersReducedMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Normalised coordinate (-1 to 1)
    const normX = (x / rect.width) * 2 - 1;
    const normY = (y / rect.height) * 2 - 1;

    setTilt({
      x: -normY * 5,
      y: normX * 5,
    });

    setSpotlight({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.18,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setSpotlight((prev) => ({ ...prev, opacity: 0 }));
  };

  // Live telemetry state matching requested baseline figures
  const [flaggedCount, setFlaggedCount] = useState(163);
  const [loginAttempts, setLoginAttempts] = useState(1305);
  const [fuzzingReqCount, setFuzzingReqCount] = useState(449);
  const [anomalyScore, setAnomalyScore] = useState(0.90);
  const [activeToast, setActiveToast] = useState('top'); // cycles between top and bottom
  const [usersRowStatus, setUsersRowStatus] = useState('Flagged');

  // Staggered entry animation on load
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 60);
    return () => clearTimeout(timer);
  }, []);

  // Periodic subtle live updates (~3s) simulating incoming WebSocket telemetry
  useEffect(() => {
    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      // Subtle tick-ups
      setFlaggedCount((prev) => prev + (Math.random() > 0.4 ? 1 : 0));
      setLoginAttempts((prev) => prev + (Math.random() > 0.5 ? 2 : 1));
      setFuzzingReqCount((prev) => prev + (Math.random() > 0.5 ? 3 : 1));

      // Realistic variation around 0.88 - 0.93
      setAnomalyScore(() => {
        const next = 0.88 + Math.random() * 0.05;
        return Math.round(next * 100) / 100;
      });

      // Status cycling for second row
      setUsersRowStatus((prev) => {
        if (prev === 'Flagged') return 'Blocked';
        if (prev === 'Blocked') return 'In review';
        return 'Flagged';
      });

      // Alternating toasts
      setActiveToast((prev) => (prev === 'top' ? 'bottom' : 'top'));
    }, 3200);

    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  // Status pill styling helper
  const getPillStyle = (status) => {
    switch (status) {
      case 'Blocked':
        return 'bg-[#F07178]/15 border border-[#F07178]/40 text-[#F07178] font-bold';
      case 'Flagged':
        return 'bg-transparent border border-[#FFCB6B]/50 text-[#FFCB6B] font-medium';
      case 'In review':
      default:
        return 'bg-transparent border border-[#82AAFF]/50 text-[#82AAFF] font-medium';
    }
  };

  const scorePercentage = Math.min(100, Math.max(0, Math.round(anomalyScore * 100)));

  return (
    <div className="relative w-full max-w-[490px] mx-auto lg:max-w-none">
      {/* Relevant Project-Specific Floating Toasts (Hidden on mobile) */}
      <FloatingToast
        position="top-right"
        title="Host Ingress 403"
        subtitle={`198.51.100.44 rejected · ${loginAttempts.toLocaleString()} brute attempts`}
        badgeText="BLOCKED"
        badgeColor="#F07178"
        icon={Lock}
        visible={activeToast === 'top' || activeToast === 'both'}
        prefersReducedMotion={prefersReducedMotion}
      />
      <FloatingToast
        position="bottom-left"
        title="Live WebSocket Stream"
        subtitle="Telemetry sync · 0ms queue latency"
        badgeText="SYNCED"
        badgeColor="#C3E88D"
        icon={Radio}
        visible={activeToast === 'bottom' || activeToast === 'both'}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* Main Card Container */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
        className={`relative rounded-3xl bg-[#101216] border border-[#1E2127] shadow-2xl p-6 sm:p-7 overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(0,0,0,0.85)] hover:border-[#2A2E37] ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Soft Radial Gradient Spotlight that follows cursor */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-out z-0"
          style={{
            background: `radial-gradient(400px circle at ${spotlight.x}% ${spotlight.y}%, rgba(199, 146, 234, ${spotlight.opacity}), transparent 70%)`,
          }}
        />

        {/* Inner Content */}
        <div className="relative z-10 flex flex-col space-y-5">
          {/* Header Row */}
          <div className="flex items-center justify-between pb-4 border-b border-[#1E2127]">
            <div className="flex items-center space-x-3.5">
              {/* Icon tile */}
              <div className="w-10 h-10 rounded-2xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] shadow-inner">
                <ShieldAlert className="w-5 h-5 stroke-[2]" />
              </div>

              {/* Title & subtitle */}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#E6E8EB] tracking-tight">
                    Live threat report
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#16181D] text-[#82AAFF] border border-[#2A2E37]">
                    PROJECT_TELEMETRY
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[#9BA1AC] mt-0.5">
                  <span className="text-[#E6E8EB] font-semibold transition-all duration-300">
                    {flaggedCount}
                  </span>{' '}
                  requests flagged · window closes in 4 min
                </p>
              </div>
            </div>

            {/* Status pill on right */}
            <div className="px-2.5 py-1 rounded-full bg-[#C3E88D]/10 border border-[#C3E88D]/30 flex items-center space-x-1.5 font-mono text-[10px] text-[#C3E88D]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D] animate-pulse" />
              <span className="font-semibold uppercase tracking-wider">Active</span>
            </div>
          </div>

          {/* 3 Real Project Threat Rows */}
          <div className="space-y-2.5 font-mono">
            {/* Row 1: /api/v1/login (Brute-force) */}
            <div
              className={`group flex items-center justify-between p-2.5 rounded-2xl transition-all duration-200 hover:bg-[#16181D] hover:border-[#2A2E37] border border-transparent ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
              style={{ transitionDelay: '100ms' }}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#F07178]/15 border border-[#F07178]/30 flex items-center justify-center text-[11px] font-bold text-[#F07178] shrink-0 group-hover:brightness-110 transition-all">
                  BF
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-[#E6E8EB] truncate">/api/v1/login</p>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-[#F07178]/10 text-[#F07178] border border-[#F07178]/25">
                      401 CLUSTER
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9BA1AC] truncate mt-0.5">
                    Brute-force ·{' '}
                    <span className="text-[#E6E8EB] font-medium">
                      {loginAttempts.toLocaleString()}
                    </span>{' '}
                    attempts
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider transition-colors duration-300 ${getPillStyle(
                    'Blocked'
                  )}`}
                >
                  Blocked
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9BA1AC] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              </div>
            </div>

            {/* Row 2: /api/v1/users (Endpoint fuzzing) */}
            <div
              className={`group flex items-center justify-between p-2.5 rounded-2xl transition-all duration-200 hover:bg-[#16181D] hover:border-[#2A2E37] border border-transparent ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
              style={{ transitionDelay: '200ms' }}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#FFCB6B]/15 border border-[#FFCB6B]/30 flex items-center justify-center text-[11px] font-bold text-[#FFCB6B] shrink-0 group-hover:brightness-110 transition-all">
                  EF
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-[#E6E8EB] truncate">/api/v1/users</p>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-[#FFCB6B]/10 text-[#FFCB6B] border border-[#FFCB6B]/25">
                      RECON PROBE
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9BA1AC] truncate mt-0.5">
                    Endpoint fuzzing ·{' '}
                    <span className="text-[#E6E8EB] font-medium">{fuzzingReqCount}</span> req
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider transition-all duration-300 ${getPillStyle(
                    usersRowStatus
                  )}`}
                >
                  {usersRowStatus}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9BA1AC] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              </div>
            </div>

            {/* Row 3: /api/v1/export (Volumetric spike) */}
            <div
              className={`group flex items-center justify-between p-2.5 rounded-2xl transition-all duration-200 hover:bg-[#16181D] hover:border-[#2A2E37] border border-transparent ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
              style={{ transitionDelay: '300ms' }}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#82AAFF]/15 border border-[#82AAFF]/30 flex items-center justify-center text-[11px] font-bold text-[#82AAFF] shrink-0 group-hover:brightness-110 transition-all">
                  VS
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-[#E6E8EB] truncate">/api/v1/export</p>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-[#82AAFF]/10 text-[#82AAFF] border border-[#82AAFF]/25">
                      BURST &gt;30/10S
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9BA1AC] truncate mt-0.5">
                    Volumetric spike · 9.2k req/min
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider transition-colors duration-300 ${getPillStyle(
                    'In review'
                  )}`}
                >
                  In review
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9BA1AC] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              </div>
            </div>
          </div>

          {/* Bottom Summary Box: Anomaly Score (Isolation Forest) */}
          <div
            className={`p-4 rounded-2xl bg-[#0A0B0D] border border-[#1E2127] font-mono transition-all duration-300 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="flex items-baseline justify-between mb-2.5">
              <div className="flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#C792EA]" />
                <span className="text-[10px] font-medium tracking-wider text-[#9BA1AC] uppercase">
                  Anomaly Score (Isolation Forest)
                </span>
              </div>
              <span className="text-xl font-bold text-[#C792EA] tracking-tight transition-all duration-300">
                {anomalyScore.toFixed(2)}
              </span>
            </div>

            {/* Animated Multi-Stop Progress Bar */}
            <div className="w-full h-2 rounded-full bg-[#16181D] border border-[#1E2127] overflow-hidden p-0.5 mb-2.5">
              <div
                className="h-full rounded-full bg-linear-to-r from-[#82AAFF] via-[#C792EA] to-[#F07178] transition-all duration-500 ease-out"
                style={{ width: `${isLoaded ? scorePercentage : 0}%` }}
              />
            </div>

            <div className="text-[11px] text-[#7B818B] flex items-center justify-between">
              <span>78% of requests scored</span>
              <span className="text-[#C3E88D] flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D] animate-pulse" />
                fail-open active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
