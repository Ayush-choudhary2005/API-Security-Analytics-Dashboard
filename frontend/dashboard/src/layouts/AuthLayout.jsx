import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, Cpu, CheckCircle2, Terminal } from 'lucide-react';

export const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-[#0A0B0D] flex flex-col md:flex-row text-[#E6E8EB] font-sans selection:bg-[#2A2E37] selection:text-[#E6E8EB]">
      {/* Left Platform Branding & Information Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#101216] p-12 flex-col justify-between border-r border-[#1E2127] relative">
        {/* Top Logo */}
        <div>
          <Link to="/" className="inline-flex items-center space-x-2.5 group">
            <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] group-hover:border-[#C792EA]/60 transition-colors shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-tight text-[#E6E8EB] transition-colors">
                API Security Analytics
              </span>
              <p className="text-[11px] font-mono text-[#7B818B]">API Security Analytics & Active Defense</p>
            </div>
          </Link>
        </div>

        {/* Middle Feature Highlights */}
        <div className="my-auto py-8 space-y-6 max-w-md">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#16181D] border border-[#1E2127] text-[10px] font-mono text-[#C792EA] mb-3 shadow-xs">
              <Terminal className="w-3.5 h-3.5 text-[#C792EA]" />
              <span>DEFENSE_ENGINE // TELEMETRY_INGEST</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#E6E8EB] leading-snug">
              Autonomous Real-Time Telemetry & Active Defense
            </h2>
            <p className="mt-2.5 text-[#9BA1AC] text-xs leading-relaxed font-mono">
              Integrate API telemetry with our fail-open non-blocking SDK. Defend endpoints against credential stuffing, endpoint fuzzing, and volumetric anomalies with tenant-isolated Isolation Forest machine learning.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <div className="group flex items-start space-x-3.5 p-4 rounded-2xl bg-[#16181D] border border-[#1E2127] hover:border-[#82AAFF]/40 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-[#82AAFF]/10 border border-[#82AAFF]/25 flex items-center justify-center text-[#82AAFF] shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Isolation Forest ML Detection</h4>
                <p className="text-[11px] text-[#9BA1AC] mt-0.5 leading-relaxed">Automated anomaly scoring with tenant-isolated mathematical baselines.</p>
              </div>
            </div>

            <div className="group flex items-start space-x-3.5 p-4 rounded-2xl bg-[#16181D] border border-[#1E2127] hover:border-[#C3E88D]/40 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-[#C3E88D]/10 border border-[#C3E88D]/25 flex items-center justify-center text-[#C3E88D] shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Fail-Open SDK Architecture</h4>
                <p className="text-[11px] text-[#9BA1AC] mt-0.5 leading-relaxed">Non-blocking background telemetry dispatch ensures host API uptime is protected.</p>
              </div>
            </div>

            <div className="group flex items-start space-x-3.5 p-4 rounded-2xl bg-[#16181D] border border-[#1E2127] hover:border-[#C792EA]/40 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-[#C792EA]/10 border border-[#C792EA]/25 flex items-center justify-center text-[#C792EA] shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Multi-Tenant Boundary Isolation</h4>
                <p className="text-[11px] text-[#9BA1AC] mt-0.5 leading-relaxed">Scoped database queries guarantee separation across all organizations.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Platform Guarantee */}
        <div className="text-[11px] font-mono text-[#7B818B] border-t border-[#1E2127] pt-4 flex items-center justify-between">
          <span>SEC_SPEC: ENTERPRISE_ISOLATION</span>
          <span className="text-[#C3E88D] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D] animate-pulse" />
            TLS 1.3 / ENCRYPTED
          </span>
        </div>
      </div>

      {/* Right Form Card Panel */}
      <div className="relative w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 overflow-hidden">
        {/* Subtle ambient violet glow */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-[#C792EA]/5 blur-[100px]"
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden mb-6">
            <Link to="/" className="inline-flex items-center space-x-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] group-hover:border-[#C792EA]/60 transition-colors shadow-xs">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                  API-Security-Analytics-Dashboard
                </span>
                <p className="text-[11px] font-mono text-[#7B818B]">API Security Platform</p>
              </div>
            </Link>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[#E6E8EB]">{title}</h1>
            {subtitle && <p className="text-xs text-[#9BA1AC] mt-1.5 font-mono">{subtitle}</p>}
          </div>

          {/* Form Content Card */}
          <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-colors rounded-3xl p-6 sm:p-8 shadow-2xl">
            {children}
          </div>

          <div className="mt-6 text-center text-[11px] font-mono text-[#7B818B] flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D]" />
            <span>Protected by rate-limiting and active anomaly detection.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;

