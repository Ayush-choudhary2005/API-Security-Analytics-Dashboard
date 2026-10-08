import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, Cpu, CheckCircle2 } from 'lucide-react';

export const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-black flex flex-col md:flex-row text-zinc-100">
      {/* Left Platform Branding & Information Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-black p-12 flex-col justify-between border-r border-zinc-800 relative">
        {/* Top Logo */}
        <div>
          <Link to="/" className="inline-flex items-center space-x-2.5 group">
            <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white group-hover:border-zinc-500 transition-colors">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-tight text-white transition-colors">
                api-security-analytics-dashboard
              </span>
              <p className="text-[11px] text-zinc-500">API Security Analytics and Active Defense</p>
            </div>
          </Link>
        </div>

        {/* Middle Feature Highlights */}
        <div className="my-auto py-10 space-y-6 max-w-md">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white leading-snug">
              Real-Time Telemetry and Autonomous Active Defense
            </h2>
            <p className="mt-2.5 text-zinc-400 text-xs leading-relaxed">
              Integrate API telemetry with our fail-open SDK. Defend endpoints against brute-force attacks, endpoint fuzzing, and volumetric anomalies with project-isolated Isolation Forest machine learning.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start space-x-3 p-3 rounded-md bg-zinc-950 border border-zinc-800">
              <Cpu className="w-4 h-4 text-white mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-zinc-200">Isolation Forest ML Detection</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">Automated anomaly scoring with tenant-isolated mathematical baselines.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-md bg-zinc-950 border border-zinc-800">
              <CheckCircle2 className="w-4 h-4 text-white mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-zinc-200">Fail-Open SDK Architecture</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">Non-blocking background telemetry dispatch ensures host API uptime is protected.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-md bg-zinc-950 border border-zinc-800">
              <Lock className="w-4 h-4 text-white mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-zinc-200">Multi-Tenant Boundary Isolation</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">Scoped database queries guarantee separation across all organizations.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Platform Guarantee */}
        <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-4">
          <span>Enterprise Security Architecture</span>
        </div>
      </div>

      {/* Right Form Card Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center space-x-2.5 mb-6">
            <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">api-security-analytics-dashboard</span>
              <p className="text-[11px] text-zinc-500">API Security Platform</p>
            </div>
          </div>

          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
          </div>

          {/* Form Content */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6 sm:p-7 shadow-2xl">
            {children}
          </div>

          <div className="mt-6 text-center text-xs text-zinc-500">
            <p>Protected by cryptographic rate-limiting and active anomaly detection.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
