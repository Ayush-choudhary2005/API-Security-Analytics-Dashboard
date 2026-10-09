import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const PublicLayout = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const { user } = useAuth() || {};

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-[#E6E8EB] flex flex-col font-sans selection:bg-[#2A2E37] selection:text-[#E6E8EB]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-[#101216]/90 backdrop-blur-md border-b border-[#1E2127]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center space-x-2.5 group">
            <div className="w-7 h-7 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] group-hover:border-[#C792EA]/60 transition-colors shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold tracking-tight text-[#E6E8EB] group-hover:text-white transition-colors">
              API-Security-Analytics-Dashboard
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-6 text-xs font-medium text-[#9BA1AC]">
            <a href="#problem" className="hover:text-[#E6E8EB] transition-colors">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-[#E6E8EB] transition-colors">
              Pipeline
            </a>
            <a href="#architecture" className="hover:text-[#E6E8EB] transition-colors">
              Architecture
            </a>
            <a href="#sdk" className="hover:text-[#E6E8EB] transition-colors">
              SDK Integration
            </a>
            <a href="#integrations" className="hover:text-[#E6E8EB] transition-colors">
              Integrations
            </a>
            <a href="#docs" className="hover:text-[#E6E8EB] transition-colors">
              Documentation
            </a>
          </nav>

          {/* CTA Buttons */}
          <div className="hidden sm:flex items-center space-x-3">
            {user ? (
              <Link
                to="/app"
                className="inline-flex items-center space-x-1.5 text-xs font-medium bg-[#16181D] hover:bg-[#1E2127] text-[#E6E8EB] border border-[#2A2E37] hover:border-[#C792EA]/60 px-3 py-1.5 rounded transition-all"
              >
                <span className="font-mono text-[#C792EA]">~/</span>
                <span>Console Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#7B818B]" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-xs font-medium text-[#9BA1AC] hover:text-[#E6E8EB] px-2.5 py-1.5 rounded transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center space-x-1 text-xs font-semibold bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] px-3 py-1.5 rounded transition-all shadow-xs"
                >
                  <span>Get Started</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-[#9BA1AC] hover:text-[#E6E8EB] rounded transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#101216] border-b border-[#1E2127] px-4 py-3 space-y-2 text-xs">
            <a
              href="#problem"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#9BA1AC] hover:text-[#E6E8EB] py-1"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#9BA1AC] hover:text-[#E6E8EB] py-1"
            >
              Pipeline
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#9BA1AC] hover:text-[#E6E8EB] py-1"
            >
              Architecture
            </a>
            <a
              href="#sdk"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#9BA1AC] hover:text-[#E6E8EB] py-1"
            >
              SDK Integration
            </a>
            <a
              href="#integrations"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#9BA1AC] hover:text-[#E6E8EB] py-1"
            >
              Integrations
            </a>
            <a
              href="#docs"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#9BA1AC] hover:text-[#E6E8EB] py-1"
            >
              Documentation
            </a>
            <div className="pt-2 border-t border-[#1E2127] flex flex-col space-y-1.5">
              <Link
                to="/login"
                className="w-full text-center py-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] border border-[#1E2127] rounded"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="w-full text-center py-1.5 text-xs bg-[#C792EA] text-[#0A0B0D] rounded font-semibold"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow">{children}</main>

      {/* Footer */}
      <footer className="bg-[#101216] border-t border-[#1E2127] py-10 text-xs text-[#9BA1AC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 text-[#E6E8EB] font-semibold text-xs mb-2.5">
              <Shield className="w-4 h-4 text-[#C792EA]" />
              <span>API-Security-Analytics-Dashboard</span>
            </div>
            <p className="text-xs text-[#9BA1AC] leading-relaxed mb-3">
              API Security Analytics & Active Defense Platform. Real-time telemetry, Isolation Forest anomaly detection, automated defense, and autonomous threat intelligence.
            </p>
            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#16181D] border border-[#1E2127] text-[#C3E88D] text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D] animate-pulse"></span>
              <span>COLLECTOR: OPERATIONAL</span>
            </div>
          </div>

          <div>
            <h4 className="text-[#E6E8EB] font-mono font-medium text-xs uppercase tracking-wider mb-2.5">Product</h4>
            <ul className="space-y-1.5 text-xs text-[#9BA1AC]">
              <li><a href="#problem" className="hover:text-[#E6E8EB] transition-colors">Attack Defense</a></li>
              <li><a href="#how-it-works" className="hover:text-[#E6E8EB] transition-colors">ML Anomaly Detection</a></li>
              <li><a href="#sdk" className="hover:text-[#E6E8EB] transition-colors">Python SDK</a></li>
              <li><a href="#integrations" className="hover:text-[#E6E8EB] transition-colors">Integrations</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#E6E8EB] font-mono font-medium text-xs uppercase tracking-wider mb-2.5">Resources</h4>
            <ul className="space-y-1.5 text-xs text-[#9BA1AC]">
              <li><a href="#docs" className="hover:text-[#E6E8EB] transition-colors">Documentation</a></li>
              <li><a href="#architecture" className="hover:text-[#E6E8EB] transition-colors">Architecture Specifications</a></li>
              <li><Link to="/login" className="hover:text-[#E6E8EB] transition-colors">Developer Console</Link></li>
              <li><span className="text-[#7B818B]">API Reference</span></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#E6E8EB] font-mono font-medium text-xs uppercase tracking-wider mb-2.5">Security Architecture</h4>
            <ul className="space-y-1.5 text-xs text-[#9BA1AC] font-mono text-[11px]">
              <li><span className="text-[#9BA1AC]">&bull; Server-Side Tenant Isolation</span></li>
              <li><span className="text-[#9BA1AC]">&bull; Zero Secret Leakage Engine</span></li>
              <li><span className="text-[#9BA1AC]">&bull; Fail-Open SDK Architecture</span></li>
              <li><span className="text-[#9BA1AC]">&bull; Single Internal User ID Model</span></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 mt-6 border-t border-[#1E2127] flex flex-col sm:flex-row items-center justify-between text-xs text-[#7B818B]">
          <p className="font-mono text-[11px]">&copy; {new Date().getFullYear()} API-Security-Analytics-Dashboard. All rights reserved.</p>
          <div className="flex space-x-5 mt-3 sm:mt-0">
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-white text-zinc-400 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-white text-zinc-400 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('security')}
              className="hover:text-white text-zinc-400 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
            >
              Security Disclosure
            </button>
          </div>
        </div>
      </footer>

      {/* Legal & Policy Modal Dialog */}
      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-[#101216] border border-[#2A2E37] rounded-md shadow-2xl p-6 sm:p-7 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E2127] pb-3 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA]">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#E6E8EB]">
                    {legalModal === 'privacy' && 'Privacy Policy'}
                    {legalModal === 'terms' && 'Terms of Service'}
                    {legalModal === 'security' && 'Security Disclosure Policy'}
                  </h3>
                  <p className="text-[11px] font-mono text-[#7B818B]">API-Security-Analytics-Dashboard</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="text-[#9BA1AC] hover:text-[#E6E8EB] p-1 rounded hover:bg-[#16181D] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5 text-xs text-[#9BA1AC] leading-relaxed">
              {legalModal === 'privacy' && (
                <>
                  <div>
                    <h4 className="text-[#E6E8EB] font-medium mb-1 text-xs">1. Telemetry Ingestion and Privacy Protection</h4>
                    <p className="text-[#9BA1AC]">
                      API-Security-Analytics-Dashboard collects HTTP telemetry metadata (request paths, HTTP verbs, status codes, request latency, and anonymized client IP hashes) exclusively to calculate machine-learning anomaly scores and defend host APIs against brute-force or volumetric abuse. We do not store unencrypted passwords, personal identifying information, or customer application payload data.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-[#E6E8EB] font-medium mb-1 text-xs">2. Multi-Tenant Cryptographic Boundaries</h4>
                    <p className="text-[#9BA1AC]">
                      All collected telemetry, active IP blocks, and Isolation Forest training models are strictly scoped to your specific tenant organization and project IDs. No telemetry data or customer traffic patterns are ever exposed or merged across different accounts.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">3. Data Retention and Control</h4>
                    <p className="text-zinc-400">
                      Your organization maintains full sovereignty over ingested telemetry. Project maintainers can purge telemetry event histories, remove API keys, and terminate project monitoring from the console at any time.
                    </p>
                  </div>
                </>
              )}

              {legalModal === 'terms' && (
                <>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">1. Authorized Monitoring</h4>
                    <p className="text-zinc-400">
                      You agree to deploy the telemetry SDKs and configure active rate-limiting or blocking solely on APIs, domains, and server infrastructure that you own or have explicit legal authorization to defend.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">2. Fail-Open Architecture and Availability</h4>
                    <p className="text-zinc-400">
                      Our SDKs are architected with non-blocking, fail-open guarantees so that telemetry dispatch will never degrade host API availability. Operators maintain full responsibility for the overall health and deployment of their upstream server infrastructure.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">3. Acceptable Platform Use</h4>
                    <p className="text-zinc-400">
                      You agree not to perform volumetric denial-of-service tests against the telemetry ingestion endpoints or attempt to bypass cryptographic multi-tenant authorization boundaries.
                    </p>
                  </div>
                </>
              )}

              {legalModal === 'security' && (
                <>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">1. Coordinated Vulnerability Disclosure</h4>
                    <p className="text-zinc-400">
                      We prioritize system security and value responsible vulnerability disclosures from developers and independent security researchers. If you identify a potential security issue in the platform or SDKs, we encourage prompt, coordinated reporting.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">2. Reporting Channel</h4>
                    <p className="text-zinc-400">
                      Please submit security reports with detailed reproduction steps, vulnerable components, and proof-of-concept indicators directly through GitHub Security Advisories or by contacting the project maintainers.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1 text-xs">3. Safe Harbor Commitment</h4>
                    <p className="text-zinc-400">
                      We will not initiate legal action against researchers acting in good faith who conduct non-disruptive testing, avoid accessing or exfiltrating tenant data, and allow reasonable time for remediation prior to public disclosure.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 pt-3 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium transition-colors border border-zinc-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
