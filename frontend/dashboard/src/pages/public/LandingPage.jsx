import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield,
  ArrowRight,
  Terminal,
  Activity,
  Cpu,
  Lock,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Radio,
  FileText,
  Copy,
  Check,
  Server,
  Database,
  Zap,
} from 'lucide-react';
import { PublicLayout } from '../../layouts/PublicLayout';

export const LandingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeFramework, setActiveFramework] = useState('flask');

  useEffect(() => {
    const oauthError = searchParams.get('error');
    const linkRequired = searchParams.get('link_required');
    if (oauthError || linkRequired) {
      navigate(`/login?${searchParams.toString()}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const codeSnippets = {
    flask: `# 1. Install package: pip install mlo11y
from flask import Flask
from security_sdk import SecurityMiddleware

app = Flask(__name__)

# 2. Attach middleware (runs non-blocking async telemetry)
SecurityMiddleware(
    app,
    api_key="ask_prod_your_api_key_here",
    collector_url="https://api.sentinapi.io/ingest"
)

@app.route("/api/checkout", methods=["POST"])
def checkout():
    return {"status": "success"}, 200

if __name__ == "__main__":
    app.run(port=5000)`,
    fastapi: `# 1. Install package: pip install mlo11y
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware

app = FastAPI()

# 2. Attach ASGI middleware
app.add_middleware(
    SecurityMiddleware,
    api_key="ask_prod_your_api_key_here",
    collector_url="https://api.sentinapi.io/ingest"
)

@app.post("/api/checkout")
async def checkout():
    return {"status": "success"}`,
    django: `# In your django settings.py:
MIDDLEWARE = [
    'security_sdk.django.SecurityMiddleware',
    # ... other middlewares
]

SECURITY_API_KEY = "ask_prod_your_api_key_here"
SECURITY_COLLECTOR_URL = "https://api.sentinapi.io/ingest"`,
    node: `// 1. Install package: npm install @sentinapi/node-sdk
const express = require('express');
const { securityMiddleware } = require('@sentinapi/node-sdk');

const app = express();

app.use(securityMiddleware({
  apiKey: 'ask_prod_your_api_key_here',
  collectorUrl: 'https://api.sentinapi.io/ingest'
}));

app.listen(3000);`
  };

  return (
    <PublicLayout>
      {/* 1. HERO SECTION */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-700/80 text-xs font-mono text-cyan-400 mb-8 shadow-sm">
            <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
            <span>Autonomous API Defense & Telemetry v2.0</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
            Defend Your APIs With <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">Machine Learning</span> & Real-Time Telemetry
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Protect against brute-force attacks, endpoint fuzzing, and volumetric anomalies with zero application latency. Non-blocking fail-open SDK, Isolation Forest ML, and autonomous root-cause threat intelligence.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm shadow-lg shadow-cyan-600/30 transition-all hover:scale-[1.02]"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-sm transition-all"
            >
              <span>Sign In</span>
            </Link>
            <a
              href="#docs"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-lg text-slate-400 hover:text-white font-medium text-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Read Documentation</span>
            </a>
          </div>

          {/* Stat metrics */}
          <div className="mt-16 pt-10 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left">
            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
              <p className="text-2xl font-bold text-white font-mono">&lt; 1.5ms</p>
              <p className="text-xs text-slate-400 mt-1">Host App SDK Overhead</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
              <p className="text-2xl font-bold text-cyan-400 font-mono">100%</p>
              <p className="text-xs text-slate-400 mt-1">Fail-Open Uptime Guarantee</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
              <p className="text-2xl font-bold text-white font-mono">Isolated</p>
              <p className="text-xs text-slate-400 mt-1">Multi-Tenant Boundaries</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
              <p className="text-2xl font-bold text-emerald-400 font-mono">Real-Time</p>
              <p className="text-xs text-slate-400 mt-1">WebSocket Alert Streaming</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. WHAT PROBLEM DOES THIS PLATFORM SOLVE */}
      <section id="problem" className="py-20 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
              Threat Vectors Mitigated
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
              What Problem Does SentinAPI Solve?
            </h2>
            <p className="text-sm text-slate-400 mt-3">
              Standard firewalls and cloud CDNs miss behavioral API anomalies. SentinAPI provides deep semantic observability and active defense against automated attacks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-rose-950/80 border border-rose-800/60 flex items-center justify-center text-rose-400 mb-4">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Brute-Force & Credential Stuffing</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Detects distributed authentication abuse, high-velocity 401 response clusters, and automated dictionary attempts across tenant endpoints.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-400 mb-4">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Endpoint & Parameter Scanning</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Flags adversarial recon bots sweeping sensitive non-existent endpoints (e.g., .env, /wp-admin, /actuator/heapdump, /.git) before exploits execute.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400 mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Volumetric Request Bursts</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Isolates abusive IPs conducting micro-DDoS bursts, inventory scraping, and denial-of-wallet queries with automated temporary IP blocking.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400 mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Zero-Day Anomalous Behavior</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Uses Isolation Forest tree partitioning to identify subtle deviations in latency, payload sizes, and header distributions that signature rules miss.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 mb-4">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Real-Time Telemetry Stream</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Live WebSocket streaming gives security and platform teams sub-second visibility into every API transaction, status code, and latency distribution.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-violet-950/80 border border-violet-800/60 flex items-center justify-center text-violet-400 mb-4">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Geographic Threat Intelligence</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Autonomous IP geolocation enrichment plots threat origin coordinates onto live interactive maps with ASN risk profiling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS (VISUAL PIPELINE) */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
              End-to-End Pipeline
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
              How SentinAPI Works
            </h2>
            <p className="text-sm text-slate-400 mt-3">
              From host API execution to machine learning scoring and automated incident resolution.
            </p>
          </div>

          <div className="relative">
            {/* Step Pipeline Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative">
                <div className="text-xs font-mono text-cyan-400 mb-2">01. INGESTION</div>
                <h4 className="text-sm font-bold text-white mb-1">Company API & SDK</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  SDK middleware hooks incoming HTTP requests, recording metadata asynchronously via non-blocking worker threads.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative">
                <div className="text-xs font-mono text-cyan-400 mb-2">02. VALIDATION</div>
                <h4 className="text-sm font-bold text-white mb-1">Secure Collector</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Authenticates CSPRNG keys, enforces rate limits, validates event schemas, and scrubs all passwords and tokens.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative">
                <div className="text-xs font-mono text-cyan-400 mb-2">03. DETECTION</div>
                <h4 className="text-sm font-bold text-white mb-1">ML Anomaly Engine</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Isolation Forest partitions features alongside rule heuristics, scoring transactions against project baselines.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative">
                <div className="text-xs font-mono text-cyan-400 mb-2">04. DEFENSE</div>
                <h4 className="text-sm font-bold text-white mb-1">Active Defense</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Critical anomalies trigger automated IP blocks, WebSocket dashboard broadcast, and Slack/Discord webhook alerts.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative">
                <div className="text-xs font-mono text-cyan-400 mb-2">05. INTELLIGENCE</div>
                <h4 className="text-sm font-bold text-white mb-1">AI Threat Report</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Autonomous threat analysis synthesizes root-cause summaries, remediation checklists, and executive PDF reports.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. ARCHITECTURE SECTION (INTERACTIVE DIAGRAM) */}
      <section id="architecture" className="py-20 bg-slate-900/30 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
              System Topology
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
              Production System Architecture
            </h2>
            <p className="text-sm text-slate-400 mt-3">
              Engineered with decoupled ingestion pipelines, background queues, and strict tenant isolation.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-10 shadow-2xl overflow-x-auto">
            <div className="min-w-[700px] flex items-center justify-between gap-4 font-mono text-xs">
              {/* Node 1 */}
              <div className="p-4 rounded-xl bg-slate-900 border border-cyan-500/40 text-center w-40">
                <div className="w-8 h-8 mx-auto rounded-lg bg-cyan-950 flex items-center justify-center text-cyan-400 mb-2">
                  <Server className="w-4 h-4" />
                </div>
                <p className="font-bold text-white">Customer API</p>
                <p className="text-[10px] text-slate-400 mt-1">Host Flask / FastAPI</p>
              </div>

              <div className="text-cyan-400 font-bold">&rarr;</div>

              {/* Node 2 */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 text-center w-40">
                <div className="w-8 h-8 mx-auto rounded-lg bg-indigo-950 flex items-center justify-center text-indigo-400 mb-2">
                  <Terminal className="w-4 h-4" />
                </div>
                <p className="font-bold text-white">SDK Middleware</p>
                <p className="text-[10px] text-slate-400 mt-1">Fail-Open Queue</p>
              </div>

              <div className="text-cyan-400 font-bold">&rarr;</div>

              {/* Node 3 */}
              <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/40 text-center w-40">
                <div className="w-8 h-8 mx-auto rounded-lg bg-emerald-950 flex items-center justify-center text-emerald-400 mb-2">
                  <Activity className="w-4 h-4" />
                </div>
                <p className="font-bold text-white">Ingestion API</p>
                <p className="text-[10px] text-slate-400 mt-1">Rate Limit / Auth</p>
              </div>

              <div className="text-cyan-400 font-bold">&rarr;</div>

              {/* Node 4 */}
              <div className="p-4 rounded-xl bg-slate-900 border border-purple-500/40 text-center w-40">
                <div className="w-8 h-8 mx-auto rounded-lg bg-purple-950 flex items-center justify-center text-purple-400 mb-2">
                  <Cpu className="w-4 h-4" />
                </div>
                <p className="font-bold text-white">Detection ML</p>
                <p className="text-[10px] text-slate-400 mt-1">Isolation Forest</p>
              </div>

              <div className="text-cyan-400 font-bold">&rarr;</div>

              {/* Node 5 */}
              <div className="p-4 rounded-xl bg-slate-900 border border-cyan-500/40 text-center w-40">
                <div className="w-8 h-8 mx-auto rounded-lg bg-cyan-950 flex items-center justify-center text-cyan-400 mb-2">
                  <Shield className="w-4 h-4" />
                </div>
                <p className="font-bold text-white">Dashboard</p>
                <p className="text-[10px] text-slate-400 mt-1">WebSocket Feeds</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-900 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Zero Database Blocking on Telemetry Ingestion</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Encrypted Tokens Stored as SHA-256 Hashes Only</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Dual Dialect Support: SQLite & PostgreSQL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. SDK INTEGRATION SECTION */}
      <section id="sdk" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
              Developer Experience
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
              Integrate in 60 Seconds
            </h2>
            <p className="text-sm text-slate-400 mt-3">
              One library, two lines of code. Works seamlessly with your existing stack.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl max-w-4xl mx-auto">
            {/* Framework Selector Tabs */}
            <div className="flex items-center justify-between bg-slate-950 px-6 py-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                {['flask', 'fastapi', 'django', 'node'].map((fw) => (
                  <button
                    key={fw}
                    onClick={() => setActiveFramework(fw)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-colors ${
                      activeFramework === fw
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {fw}
                  </button>
                ))}
              </div>
              <button
                onClick={() => copyCode(codeSnippets[activeFramework])}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Copied' : 'Copy Snippet'}</span>
              </button>
            </div>

            {/* Code Display */}
            <div className="p-6 bg-slate-950/80 overflow-x-auto">
              <pre className="text-xs font-mono text-cyan-200 leading-relaxed">
                <code>{codeSnippets[activeFramework]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 8. INTEGRATIONS SECTION */}
      <section id="integrations" className="py-20 bg-slate-900/40 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
              Ecosystem
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
              Supported Integrations
            </h2>
            <p className="text-sm text-slate-400 mt-3">
              Route alerts to your operational workflows with masked secrets and reliable retries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800/50 flex items-center justify-center text-emerald-400 mb-4 font-bold font-mono">
                SL
              </div>
              <h4 className="text-sm font-bold text-white">Slack Webhooks</h4>
              <p className="text-xs text-slate-400 mt-2">
                Instant incident notifications dispatched to targeted channel with severity tags and unblock shortcuts.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mb-4 font-bold font-mono">
                DC
              </div>
              <h4 className="text-sm font-bold text-white">Discord Webhooks</h4>
              <p className="text-xs text-slate-400 mt-2">
                Formatted markdown embed alerts delivered to security operations rooms with zero secret leakage.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-800/50 flex items-center justify-center text-cyan-400 mb-4 font-bold font-mono">
                AI
              </div>
              <h4 className="text-sm font-bold text-white">Google Gemini Intelligence</h4>
              <p className="text-xs text-slate-400 mt-2">
                Autonomous root-cause threat intelligence report generation with automated heuristic offline fallbacks.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-amber-950 border border-amber-800/50 flex items-center justify-center text-amber-400 mb-4 font-bold font-mono">
                WH
              </div>
              <h4 className="text-sm font-bold text-white">Generic HTTPS Webhooks</h4>
              <p className="text-xs text-slate-400 mt-2">
                Custom SIEM and SOAR payload forwarding compatible with Datadog, Splunk, and PagerDuty endpoints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. DOCUMENTATION SECTION */}
      <section id="docs" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
              Reference
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
              Platform Documentation & Guarantees
            </h2>
            <p className="text-sm text-slate-400 mt-3">
              Core architectural principles ensuring zero risk to production API traffic.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-2">Fail-Open Architecture</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                If the SentinAPI telemetry collector becomes unreachable or experiences high latency, SDK middleware fails open immediately. Host API endpoints serve customer requests at full speed without crashing.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-2">Strict Tenant Isolation</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Organizations, users, projects, and credentials are cryptographically isolated. All database queries enforce organization boundaries; cross-tenant access attempts return HTTP 403 Forbidden.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-2">Zero Secret Exposure</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                API credentials are only displayed once upon creation. In database persistence and server logs, all tokens, webhook URLs, and Gemini keys are cryptographically hashed or masked.
              </p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/signup"
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-md transition-all"
            >
              <span>Create Free Account & Start Defending APIs</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};
