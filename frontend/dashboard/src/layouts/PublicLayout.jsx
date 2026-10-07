import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronRight, Menu, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const PublicLayout = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
                SentinAPI
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-mono uppercase tracking-wider text-cyan-400/80 border border-cyan-800/60 rounded px-1.5 py-0.5">
                v2.0
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
              <span>SentinAPI</span>
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
              <li><span className="text-slate-500">API Reference (v2.0)</span></li>
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
          <p>&copy; {new Date().getFullYear()} SentinAPI Platform. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 sm:mt-0">
            <span className="hover:text-slate-400">Privacy Policy</span>
            <span className="hover:text-slate-400">Terms of Service</span>
            <span className="hover:text-slate-400">Security Disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
