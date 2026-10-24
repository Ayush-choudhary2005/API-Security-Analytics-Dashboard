import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { ThreatPanel } from './ThreatPanel';

/**
 * Hero
 * Two-column landing page hero section:
 * - Left column: Eyebrow badge, Georgia/Source Serif 4 headline, subtext, rounded pill buttons, 4 stat items
 * - Right column: Dynamic live threat panel with floating toast notifications
 * - Responsive: 55/45 split on desktop, stacked on mobile with toasts hidden
 */
export const Hero = () => {
  return (
    <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 border-b border-[#1E2127] overflow-hidden">
      {/* Ambient background glow behind right column */}
      <div
        className="pointer-events-none absolute top-1/4 right-10 w-[450px] h-[450px] rounded-full bg-[#C792EA]/5 blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* ================= LEFT COLUMN (~55% = 7 cols) ================= */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* 1. Eyebrow badge */}
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#101216] border border-[#1E2127] text-[11px] font-mono text-[#82AAFF] mb-6 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D] animate-pulse" />
              <span>API-Security-Analytics-Dashboard // SYSTEM SPEC 2.0</span>
            </div>

            {/* 2. Headline (Serif font, very large, tight line-height, left aligned) */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl text-[#E6E8EB] leading-[1.08] tracking-tight max-w-2xl"
              style={{
                fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif',
              }}
            >
              Defend Your APIs With Machine Learning and Real-Time Telemetry
            </h1>

            {/* 3. Subtext (muted color, monospace) */}
            <p className="mt-5 text-sm sm:text-base text-[#9BA1AC] max-w-xl leading-relaxed font-mono">
              Protect against brute-force probes, endpoint fuzzing, and volumetric anomalies with fail-open SDKs and Isolation Forest machine learning.
            </p>

            {/* 4. Buttons row (pill-shaped, fully rounded, with hover physics) */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5 font-mono">
              <Link
                to="/signup"
                className="group inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-full bg-[#C792EA] hover:bg-[#d6a5f5] hover:-translate-y-0.5 text-[#0A0B0D] font-bold text-xs transition-all duration-200 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C792EA]"
              >
                <span>PROVISION INSTANCE</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
              </Link>

              <Link
                to="/login"
                className="inline-flex items-center justify-center space-x-1.5 px-6 py-3 rounded-full bg-[#16181D] hover:bg-[#1E2127] hover:-translate-y-0.5 text-[#E6E8EB] border border-[#2A2E37] hover:border-[#C792EA]/50 font-semibold text-xs transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E6E8EB]"
              >
                <span>OPERATOR LOGIN</span>
              </Link>

              <a
                href="#docs"
                className="group inline-flex items-center justify-center space-x-1.5 px-4 py-3 rounded-full text-[#9BA1AC] hover:text-[#E6E8EB] font-medium text-xs transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82AAFF]"
              >
                <FileText className="w-3.5 h-3.5 text-[#82AAFF] group-hover:text-[#E6E8EB] transition-colors" />
                <span>ARCHITECTURE SPEC</span>
              </a>
            </div>

            {/* 5. Thin divider line under buttons, then 4 stats in a row */}
            <div className="mt-10 pt-8 border-t border-[#1E2127] w-full">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                {/* Stat 1: Blue accent */}
                <div className="p-3.5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-colors">
                  <p className="text-xl font-bold text-[#82AAFF] tracking-tight">&lt; 1.5ms</p>
                  <p className="text-[11px] text-[#7B818B] mt-1 leading-snug">Host SDK Ingest Overhead</p>
                </div>

                {/* Stat 2: Green accent */}
                <div className="p-3.5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-colors">
                  <p className="text-xl font-bold text-[#C3E88D] tracking-tight">100%</p>
                  <p className="text-[11px] text-[#7B818B] mt-1 leading-snug">Fail-Open Guarantee</p>
                </div>

                {/* Stat 3: Purple accent */}
                <div className="p-3.5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-colors">
                  <p className="text-xl font-bold text-[#C792EA] tracking-tight">ISOLATED</p>
                  <p className="text-[11px] text-[#7B818B] mt-1 leading-snug">Multi-Tenant Boundaries</p>
                </div>

                {/* Stat 4: Amber/Orange accent */}
                <div className="p-3.5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-colors">
                  <p className="text-xl font-bold text-[#FFCB6B] tracking-tight">SUB-SECOND</p>
                  <p className="text-[11px] text-[#7B818B] mt-1 leading-snug">Live WebSocket Telemetry</p>
                </div>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN (~45% = 5 cols) ================= */}
          <div className="lg:col-span-5 w-full flex items-center justify-center lg:justify-end">
            <ThreatPanel />
          </div>
        </div>
      </div>
    </section>
  );
};
