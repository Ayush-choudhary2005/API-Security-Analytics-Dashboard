import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield,
  ArrowRight,
  Terminal,
  Activity,
  Cpu,
  Lock,
  Search,
  CheckCircle2,
  Globe,
  FileText,
  Copy,
  Check,
  Server,
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
      <section className="relative pt-16 pb-16 md:pt-24 md:pb-20 border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow Label */}
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            <span>Autonomous API Defense and Telemetry</span>
          </div>

          {/* Heading (Max 2 lines) */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white max-w-3xl mx-auto leading-tight">
            Defend Your APIs With Machine Learning and Real-Time Telemetry
          </h1>

          {/* Subtitle (Max 20 words) */}
          <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Protect against brute-force attacks, endpoint fuzzing, and volumetric anomalies with fail-open SDKs and Isolation Forest machine learning.
          </p>

          {/* CTA Buttons (Visible without scrolling) */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-5 py-2.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-5 py-2.5 rounded bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border border-zinc-800 font-medium text-xs transition-colors"
            >
              <span>Sign In</span>
            </Link>
            <a
              href="#docs"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded text-zinc-400 hover:text-white font-medium text-xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Read Documentation</span>
            </a>
          </div>

          {/* Stat metrics */}
          <div className="mt-12 pt-8 border-t border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800">
              <p className="text-xl font-bold text-white font-mono">&lt; 1.5ms</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Host App SDK Overhead</p>
            </div>
            <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800">
              <p className="text-xl font-bold text-white font-mono">100%</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Fail-Open Uptime Guarantee</p>
            </div>
            <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800">
              <p className="text-xl font-bold text-white font-mono">Isolated</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Multi-Tenant Boundaries</p>
            </div>
            <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800">
              <p className="text-xl font-bold text-white font-mono">Real-Time</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">WebSocket Alert Streaming</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. WHAT PROBLEM DOES THIS PLATFORM SOLVE */}
      <section id="problem" className="py-16 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Threat Vectors Mitigated
            </h2>
            <p className="text-xs text-zinc-400 mt-2">
              Standard firewalls and cloud CDNs miss behavioral anomalies. This platform provides deep semantic observability and active defense against automated attacks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-3">
                <Lock className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Brute-Force and Credential Stuffing</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Detects distributed authentication abuse, high-velocity 401 response clusters, and automated dictionary attempts across tenant endpoints.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3">
                <Search className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Endpoint and Parameter Scanning</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Flags adversarial recon bots sweeping non-existent endpoints (.env, /wp-admin, /actuator/heapdump, /.git) before exploits execute.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-3">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Volumetric Request Bursts</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Isolates abusive IPs conducting micro-DDoS bursts, inventory scraping, and denial-of-wallet queries with automated temporary IP blocking.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Zero-Day Anomalous Behavior</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Uses Isolation Forest tree partitioning to identify deviations in latency, payload sizes, and header distributions that signature rules miss.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-3">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Real-Time Telemetry Stream</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Live WebSocket streaming gives security and platform teams sub-second visibility into every API transaction, status code, and latency distribution.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3">
                <Globe className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Geographic Threat Intelligence</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Autonomous IP geolocation enrichment plots threat origin coordinates onto live interactive maps with ASN risk profiling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS (VISUAL PIPELINE) */}
      <section id="how-it-works" className="py-16 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              End-to-End Defense Pipeline
            </h2>
            <p className="text-xs text-zinc-400 mt-2">
              From host API execution to machine learning scoring and automated incident resolution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[11px] font-mono text-zinc-400 mb-1.5">01. INGESTION</div>
              <h4 className="text-xs font-semibold text-white mb-1">Company API and SDK</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                SDK middleware hooks incoming HTTP requests, recording metadata asynchronously via non-blocking worker threads.
              </p>
            </div>

            <div className="p-4 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[11px] font-mono text-zinc-400 mb-1.5">02. VALIDATION</div>
              <h4 className="text-xs font-semibold text-white mb-1">Secure Collector</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Authenticates CSPRNG keys, enforces rate limits, validates event schemas, and scrubs all passwords and tokens.
              </p>
            </div>

            <div className="p-4 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[11px] font-mono text-zinc-400 mb-1.5">03. DETECTION</div>
              <h4 className="text-xs font-semibold text-white mb-1">ML Anomaly Engine</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Isolation Forest partitions features alongside rule heuristics, scoring transactions against project baselines.
              </p>
            </div>

            <div className="p-4 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[11px] font-mono text-zinc-400 mb-1.5">04. DEFENSE</div>
              <h4 className="text-xs font-semibold text-white mb-1">Active Defense</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Critical anomalies trigger automated IP blocks, WebSocket dashboard broadcast, and Slack or Discord webhook alerts.
              </p>
            </div>

            <div className="p-4 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[11px] font-mono text-zinc-400 mb-1.5">05. FORENSICS</div>
              <h4 className="text-xs font-semibold text-white mb-1">AI Threat Report</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Autonomous threat analysis synthesizes root-cause summaries, remediation checklists, and executive PDF reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ARCHITECTURE SECTION */}
      <section id="architecture" className="py-16 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Production System Architecture
            </h2>
            <p className="text-xs text-zinc-400 mt-2">
              Engineered with decoupled ingestion pipelines, background queues, and strict tenant isolation.
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6 sm:p-8 overflow-x-auto">
            <div className="min-w-[640px] flex items-center justify-between gap-3 font-mono text-xs">
              <div className="p-3.5 rounded bg-black border border-zinc-800 text-center w-36">
                <Server className="w-4 h-4 mx-auto text-white mb-1.5" />
                <p className="font-semibold text-white text-[11px]">Customer API</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Flask / FastAPI</p>
              </div>

              <div className="text-zinc-600 font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-black border border-zinc-800 text-center w-36">
                <Terminal className="w-4 h-4 mx-auto text-zinc-300 mb-1.5" />
                <p className="font-semibold text-white text-[11px]">SDK Middleware</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Fail-Open Queue</p>
              </div>

              <div className="text-zinc-600 font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-black border border-zinc-800 text-center w-36">
                <Activity className="w-4 h-4 mx-auto text-white mb-1.5" />
                <p className="font-semibold text-white text-[11px]">Ingestion API</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Auth / Scoping</p>
              </div>

              <div className="text-zinc-600 font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-black border border-zinc-800 text-center w-36">
                <Cpu className="w-4 h-4 mx-auto text-zinc-300 mb-1.5" />
                <p className="font-semibold text-white text-[11px]">Detection ML</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Isolation Forest</p>
              </div>

              <div className="text-zinc-600 font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-black border border-zinc-800 text-center w-36">
                <Shield className="w-4 h-4 mx-auto text-white mb-1.5" />
                <p className="font-semibold text-white text-[11px]">Dashboard</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Live WebSocket</p>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-400">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />
                <span>Zero Database Blocking on Telemetry Ingestion</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />
                <span>Encrypted Tokens Stored as SHA-256 Hashes Only</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />
                <span>Dual Dialect Support: SQLite and PostgreSQL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SDK INTEGRATION SECTION */}
      <section id="sdk" className="py-16 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Integrate in Under 60 Seconds
            </h2>
            <p className="text-xs text-zinc-400 mt-2">
              Non-blocking telemetry collection compatible with standard Python and Node.js frameworks.
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden max-w-3xl mx-auto">
            {/* Framework Selector Tabs */}
            <div className="flex items-center justify-between bg-black px-4 py-2 border-b border-zinc-800">
              <div className="flex items-center space-x-1">
                {['flask', 'fastapi', 'django', 'node'].map((fw) => (
                  <button
                    key={fw}
                    onClick={() => setActiveFramework(fw)}
                    className={`px-2.5 py-1 rounded text-xs font-mono uppercase transition-colors ${
                      activeFramework === fw
                        ? 'bg-zinc-800 text-white font-medium border border-zinc-700'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {fw}
                  </button>
                ))}
              </div>
              <button
                onClick={() => copyCode(codeSnippets[activeFramework])}
                className="inline-flex items-center space-x-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 rounded border border-zinc-800 transition-colors"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Copied' : 'Copy Snippet'}</span>
              </button>
            </div>

            {/* Code Display */}
            <div className="p-4 bg-black overflow-x-auto">
              <pre className="text-xs font-mono text-zinc-300 leading-relaxed">
                <code>{codeSnippets[activeFramework]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 6. INTEGRATIONS SECTION */}
      <section id="integrations" className="py-16 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Supported Integrations
            </h2>
            <p className="text-xs text-zinc-400 mt-2">
              Route alerts to your operational workflows with masked secrets and reliable retries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-3 font-semibold text-xs font-mono">
                SL
              </div>
              <h4 className="text-xs font-semibold text-white">Slack Webhooks</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Instant incident notifications dispatched to targeted channel with severity tags and unblock shortcuts.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3 font-semibold text-xs font-mono">
                DC
              </div>
              <h4 className="text-xs font-semibold text-white">Discord Webhooks</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Formatted markdown embed alerts delivered to security operations rooms with zero secret leakage.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-3 font-semibold text-xs font-mono">
                AI
              </div>
              <h4 className="text-xs font-semibold text-white">Google Gemini</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Autonomous root-cause threat intelligence report generation with automated heuristic offline fallbacks.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3 font-semibold text-xs font-mono">
                WH
              </div>
              <h4 className="text-xs font-semibold text-white">Generic HTTPS</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Custom SIEM and SOAR payload forwarding compatible with Datadog, Splunk, and PagerDuty endpoints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. DOCUMENTATION SECTION */}
      <section id="docs" className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Platform Guarantees and Architecture
            </h2>
            <p className="text-xs text-zinc-400 mt-2">
              Core architectural principles ensuring zero risk to production API traffic.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <h4 className="text-xs font-semibold text-white mb-1.5">Fail-Open Architecture</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                If the telemetry collector becomes unreachable or experiences high latency, SDK middleware fails open immediately. Host API endpoints serve customer requests at full speed without crashing.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <h4 className="text-xs font-semibold text-white mb-1.5">Strict Tenant Isolation</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Organizations, users, projects, and credentials are cryptographically isolated. All database queries enforce organization boundaries; cross-tenant access attempts return HTTP 403 Forbidden.
              </p>
            </div>

            <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
              <h4 className="text-xs font-semibold text-white mb-1.5">Zero Secret Exposure</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                API credentials are only displayed once upon creation. In database persistence and server logs, all tokens, webhook URLs, and Gemini keys are cryptographically hashed or masked.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/signup"
              className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors"
            >
              <span>Create Free Account and Start Defending APIs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};
