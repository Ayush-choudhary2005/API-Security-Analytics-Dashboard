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
                API-Security-Analytics-Dashboard
              </span>
              <p className="text-[11px] font-mono text-[#7B818B]">API Security Analytics & Active Defense</p>
            </div>
          </Link>
        </div>

        {/* Middle Feature Highlights */}
        <div className="my-auto py-8 space-y-6 max-w-md">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#16181D] border border-[#1E2127] text-[10px] font-mono text-[#C792EA] mb-3">
              <Terminal className="w-3 h-3 text-[#C792EA]" />
              <span>DEFENSE_ENGINE // TELEMETRY_INGEST</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#E6E8EB] leading-snug">
              Autonomous Real-Time Telemetry & Active Defense
            </h2>
            <p className="mt-2.5 text-[#9BA1AC] text-xs leading-relaxed">
              Integrate API telemetry with our fail-open non-blocking SDK. Defend endpoints against credential stuffing, endpoint fuzzing, and volumetric anomalies with tenant-isolated Isolation Forest machine learning.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-start space-x-3 p-3.5 rounded-md bg-[#16181D] border border-[#1E2127]">
              <Cpu className="w-4 h-4 text-[#82AAFF] mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-[#E6E8EB]">Isolation Forest ML Detection</h4>
                <p className="text-[11px] text-[#9BA1AC] mt-0.5">Automated anomaly scoring with tenant-isolated mathematical baselines.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3.5 rounded-md bg-[#16181D] border border-[#1E2127]">
              <CheckCircle2 className="w-4 h-4 text-[#C3E88D] mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-[#E6E8EB]">Fail-Open SDK Architecture</h4>
                <p className="text-[11px] text-[#9BA1AC] mt-0.5">Non-blocking background telemetry dispatch ensures host API uptime is protected.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3.5 rounded-md bg-[#16181D] border border-[#1E2127]">
              <Lock className="w-4 h-4 text-[#C792EA] mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-[#E6E8EB]">Multi-Tenant Boundary Isolation</h4>
                <p className="text-[11px] text-[#9BA1AC] mt-0.5">Scoped database queries guarantee separation across all organizations.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Platform Guarantee */}
        <div className="text-[11px] font-mono text-[#7B818B] border-t border-[#1E2127] pt-4 flex items-center justify-between">
          <span>SEC_SPEC: ENTERPRISE_ISOLATION</span>
          <span className="text-[#C3E88D]">TLS 1.3 / ENCRYPTED</span>
        </div>
      </div>

      {/* Right Form Card Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center space-x-2.5 mb-6">
            <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA]">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-[#E6E8EB]">API-Security-Analytics-Dashboard</span>
              <p className="text-[11px] font-mono text-[#7B818B]">API Security Platform</p>
            </div>
          </div>

          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-[#E6E8EB]">{title}</h1>
            {subtitle && <p className="text-xs text-[#9BA1AC] mt-1">{subtitle}</p>}
          </div>

          {/* Form Content */}
          <div className="bg-[#101216] border border-[#1E2127] rounded-md p-6 sm:p-7 shadow-2xl">
            {children}
          </div>

          <div className="mt-6 text-center text-[11px] font-mono text-[#7B818B]">
            <p>Protected by rate-limiting and active anomaly detection.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;

