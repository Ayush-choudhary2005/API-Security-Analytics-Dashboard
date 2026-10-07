import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, Server, Cpu, Activity, CheckCircle2 } from 'lucide-react';

export const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row text-slate-100">
      {/* Left Platform Branding & Information Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 p-12 flex-col justify-between border-r border-slate-800/80 relative overflow-hidden">
        {/* Decorative Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>

        {/* Top Logo */}
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400 transition-colors">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                api-security-analytics-dashboard
              </span>
              <p className="text-xs text-slate-400">API Security Analytics & Active Defense</p>
            </div>
          </Link>
        </div>

        {/* Middle Feature Highlights */}
        <div className="relative z-10 my-auto py-12 space-y-8 max-w-lg">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
              Real-Time Telemetry & Autonomous Active Defense
            </h2>
            <p className="mt-3 text-slate-400 text-sm leading-relaxed">
              Integrate API telemetry in under 60 seconds with our fail-open SDK. Stop brute-force attacks, endpoint fuzzing, and volumetric bursts with project-isolated Isolation Forest machine learning.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2">
            <div className="flex items-start space-x-3 p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="p-2 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Isolation Forest ML Detection</h4>
                <p className="text-xs text-slate-400 mt-0.5">Automated anomaly scoring with tenant-isolated mathematical baselines.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="p-2 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Fail-Open SDK Architecture</h4>
                <p className="text-xs text-slate-400 mt-0.5">Non-blocking background telemetry dispatch ensures host API uptime is never impacted.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="p-2 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/50">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Strict Multi-Tenant Isolation</h4>
                <p className="text-xs text-slate-400 mt-0.5">Cryptographic scoping guarantees zero data leakage across organizations.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Platform Guarantee */}
        <div className="relative z-10 text-xs text-slate-500 flex items-center justify-between border-t border-slate-800/80 pt-6">
          <span>Enterprise-Grade Security Architecture</span>
        </div>
      </div>

      {/* Right Form Card Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center space-x-3 mb-8">
            <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">api-security-analytics-dashboard</span>
              <p className="text-xs text-slate-400">API Security Platform</p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
          </div>

          {/* Form Content */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 sm:p-8 shadow-xl shadow-black/40">
            {children}
          </div>

          <div className="mt-8 text-center text-xs text-slate-500">
            <p>Protected by cryptographic rate-limiting and active anomaly detection.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
