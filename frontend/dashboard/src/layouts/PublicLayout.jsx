import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronRight, Menu, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const PublicLayout = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const { user } = useAuth() || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400 transition-colors">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                api-security-analytics-dashboard
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#problem" className="hover:text-cyan-400 transition-colors">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
              How It Works
            </a>
            <a href="#architecture" className="hover:text-cyan-400 transition-colors">
              Architecture
            </a>
            <a href="#sdk" className="hover:text-cyan-400 transition-colors">
              SDK Integration
            </a>
            <a href="#integrations" className="hover:text-cyan-400 transition-colors">
              Integrations
            </a>
            <a href="#docs" className="hover:text-cyan-400 transition-colors">
              Documentation
            </a>
          </nav>

          {/* CTA Buttons */}
          <div className="hidden sm:flex items-center space-x-4">
            {user ? (
              <Link
                to="/app"
                className="inline-flex items-center space-x-1.5 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg shadow-sm shadow-cyan-600/30 transition-all"
              >
                <span>Console Dashboard</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-300 hover:text-white px-3 py-2 rounded-md transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center space-x-1.5 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg shadow-sm shadow-cyan-600/30 transition-all"
                >
                  <span>Get Started</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-4 space-y-3">
            <a
              href="#problem"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-slate-300 hover:text-cyan-400"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-slate-300 hover:text-cyan-400"
            >
              How It Works
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-slate-300 hover:text-cyan-400"
            >
              Architecture
            </a>
            <a
              href="#sdk"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-slate-300 hover:text-cyan-400"
            >
              SDK Integration
            </a>
            <a
              href="#integrations"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-slate-300 hover:text-cyan-400"
            >
              Integrations
            </a>
            <a
              href="#docs"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-slate-300 hover:text-cyan-400"
            >
              Documentation
            </a>
            <div className="pt-3 border-t border-slate-800 flex flex-col space-y-2">
              <Link
                to="/login"
                className="w-full text-center py-2 text-sm text-slate-300 hover:text-white border border-slate-700 rounded-md"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="w-full text-center py-2 text-sm bg-cyan-600 text-white rounded-md font-medium"
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
      <footer className="bg-slate-950 border-t border-slate-800 py-12 text-sm text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 text-white font-bold text-base mb-3">
              <Shield className="w-5 h-5 text-cyan-400" />
              <span>api-security-analytics-dashboard</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Enterprise API Security Analytics & Active Defense Platform. Real-time telemetry, Isolation Forest anomaly detection, automated defense, and autonomous threat intelligence.
            </p>
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>All Systems Operational</span>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">Product</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#problem" className="hover:text-cyan-400 transition-colors">Attack Defense</a></li>
              <li><a href="#how-it-works" className="hover:text-cyan-400 transition-colors">ML Anomaly Detection</a></li>
              <li><a href="#sdk" className="hover:text-cyan-400 transition-colors">Python SDK</a></li>
              <li><a href="#integrations" className="hover:text-cyan-400 transition-colors">Integrations</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">Resources</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#docs" className="hover:text-cyan-400 transition-colors">Documentation</a></li>
              <li><a href="#architecture" className="hover:text-cyan-400 transition-colors">Architecture Specifications</a></li>
              <li><Link to="/login" className="hover:text-cyan-400 transition-colors">Developer Console</Link></li>
              <li><span className="text-slate-500">API Reference</span></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">Compliance & Security</h4>
            <ul className="space-y-2 text-xs">
              <li><span className="text-slate-300">Server-Side Tenant Isolation</span></li>
              <li><span className="text-slate-300">Zero Secret Leakage Engine</span></li>
              <li><span className="text-slate-300">Fail-Open SDK Architecture</span></li>
              <li><span className="text-slate-300">Single Internal User ID Model</span></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 mt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} api-security-analytics-dashboard. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 sm:mt-0">
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('security')}
              className="hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
            >
              Security Disclosure
            </button>
          </div>
        </div>
      </footer>

      {/* Legal & Policy Modal Dialog */}
      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {legalModal === 'privacy' && 'Privacy Policy'}
                    {legalModal === 'terms' && 'Terms of Service'}
                    {legalModal === 'security' && 'Security Disclosure Policy'}
                  </h3>
                  <p className="text-xs text-slate-400">api-security-analytics-dashboard</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
              {legalModal === 'privacy' && (
                <>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">1. Telemetry Ingestion & Privacy Protection</h4>
                    <p className="text-xs text-slate-400">
                      api-security-analytics-dashboard collects HTTP telemetry metadata (request paths, HTTP verbs, status codes, request latency, and anonymized client IP hashes) exclusively to calculate machine-learning anomaly scores and defend host APIs against brute-force or volumetric abuse. We do not store unencrypted passwords, personal identifying information, or customer application payload data.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">2. Multi-Tenant Cryptographic Boundaries</h4>
                    <p className="text-xs text-slate-400">
                      All collected telemetry, active IP blocks, and Isolation Forest training models are strictly scoped to your specific tenant organization and project IDs. No telemetry data or customer traffic patterns are ever exposed or merged across different accounts.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">3. Data Retention and Control</h4>
                    <p className="text-xs text-slate-400">
                      Your organization maintains full sovereignty over ingested telemetry. Project maintainers can purge telemetry event histories, remove API keys, and terminate project monitoring from the console at any time.
                    </p>
                  </div>
                </>
              )}

              {legalModal === 'terms' && (
                <>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">1. Authorized Monitoring</h4>
                    <p className="text-xs text-slate-400">
                      You agree to deploy the telemetry SDKs and configure active rate-limiting or blocking solely on APIs, domains, and server infrastructure that you own or have explicit legal authorization to defend.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">2. Fail-Open Architecture & Availability</h4>
                    <p className="text-xs text-slate-400">
                      Our SDKs are architected with non-blocking, fail-open guarantees so that telemetry dispatch will never degrade host API availability. Operators maintain full responsibility for the overall health and deployment of their upstream server infrastructure.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">3. Acceptable Platform Use</h4>
                    <p className="text-xs text-slate-400">
                      You agree not to perform volumetric denial-of-service tests against the telemetry ingestion endpoints or attempt to bypass cryptographic multi-tenant authorization boundaries.
                    </p>
                  </div>
                </>
              )}

              {legalModal === 'security' && (
                <>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">1. Coordinated Vulnerability Disclosure</h4>
                    <p className="text-xs text-slate-400">
                      We prioritize system security and value responsible vulnerability disclosures from developers and independent security researchers. If you identify a potential security issue in the platform or SDKs, we encourage prompt, coordinated reporting.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">2. Reporting Channel</h4>
                    <p className="text-xs text-slate-400">
                      Please submit security reports with detailed reproduction steps, vulnerable components, and proof-of-concept indicators directly through GitHub Security Advisories or by contacting the project maintainers.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1 text-sm">3. Safe Harbor Commitment</h4>
                    <p className="text-xs text-slate-400">
                      We will not initiate legal action against researchers acting in good faith who conduct non-disruptive testing, avoid accessing or exfiltrating tenant data, and allow reasonable time for remediation prior to public disclosure.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
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
