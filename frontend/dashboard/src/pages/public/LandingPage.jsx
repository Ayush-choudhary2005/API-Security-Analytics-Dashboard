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
  Radio,
  Layers,
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

# 2. Attach middleware (runs non-blocking async telemetry queue)
SecurityMiddleware(
    app,
    api_key="ask_prod_your_api_key_here",
    collector_url="/ingest"
)

@app.route("/api/v1/checkout", methods=["POST"])
def checkout():
    return {"status": "success"}, 200

if __name__ == "__main__":
    app.run(port=5000)`,
    fastapi: `# 1. Install package: pip install mlo11y
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware

app = FastAPI()

# 2. Attach ASGI telemetry middleware
app.add_middleware(
    SecurityMiddleware,
    api_key="ask_prod_your_api_key_here",
    collector_url="/ingest"
)

@app.post("/api/v1/checkout")
async def checkout():
    return {"status": "success"}`,
    django: `# In your django settings.py:
MIDDLEWARE = [
    'security_sdk.django.SecurityMiddleware',
    # ... other standard middlewares
]

SECURITY_API_KEY = "ask_prod_your_api_key_here"
SECURITY_COLLECTOR_URL = "/ingest"`,
    node: `// 1. Install package: npm install @security-analytics/node-sdk
const express = require('express');
const { securityMiddleware } = require('@security-analytics/node-sdk');

const app = express();

app.use(securityMiddleware({
  apiKey: 'ask_prod_your_api_key_here',
  collectorUrl: '/ingest'
}));

app.listen(3000);`
  };

  return (
    <PublicLayout>
      {/* 1. HERO SECTION */}
      <section className="relative pt-16 pb-16 md:pt-24 md:pb-20 border-b border-[#1E2127]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow Label */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded bg-[#101216] border border-[#1E2127] text-[11px] font-mono text-[#82AAFF] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D] animate-pulse"></span>
            <span>API-Security-Analytics-Dashboard // SYSTEM SPEC 2.0</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#E6E8EB] max-w-3xl mx-auto leading-tight">
            Defend Your APIs With Machine Learning and Real-Time Telemetry
          </h1>

          {/* Subtitle */}
          <p className="mt-4 text-sm sm:text-base text-[#9BA1AC] max-w-xl mx-auto leading-relaxed font-mono">
            Protect against brute-force probes, endpoint fuzzing, and volumetric anomalies with fail-open SDKs and Isolation Forest machine learning.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 font-mono">
            <Link
              to="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-6 py-2.5 rounded bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] font-bold text-xs transition-colors shadow-xs"
            >
              <span>PROVISION INSTANCE</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-6 py-2.5 rounded bg-[#16181D] hover:bg-[#1E2127] text-[#E6E8EB] border border-[#1E2127] font-semibold text-xs transition-colors"
            >
              <span>OPERATOR LOGIN</span>
            </Link>
            <a
              href="#docs"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded text-[#9BA1AC] hover:text-[#E6E8EB] font-medium text-xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>ARCHITECTURE SPEC</span>
            </a>
          </div>

          {/* Stat metrics */}
          <div className="mt-12 pt-8 border-t border-[#1E2127] grid grid-cols-2 md:grid-cols-4 gap-4 text-left font-mono">
            <div className="p-3.5 rounded bg-[#101216] border border-[#1E2127]">
              <p className="text-xl font-bold text-[#82AAFF]">&lt; 1.5ms</p>
              <p className="text-[11px] text-[#7B818B] mt-0.5">Host SDK Ingest Overhead</p>
            </div>
            <div className="p-3.5 rounded bg-[#101216] border border-[#1E2127]">
              <p className="text-xl font-bold text-[#C3E88D]">100%</p>
              <p className="text-[11px] text-[#7B818B] mt-0.5">Fail-Open Guarantee</p>
            </div>
            <div className="p-3.5 rounded bg-[#101216] border border-[#1E2127]">
              <p className="text-xl font-bold text-[#C792EA]">ISOLATED</p>
              <p className="text-[11px] text-[#7B818B] mt-0.5">Multi-Tenant Boundaries</p>
            </div>
            <div className="p-3.5 rounded bg-[#101216] border border-[#1E2127]">
              <p className="text-xl font-bold text-[#FFCB6B]">SUB-SECOND</p>
              <p className="text-[11px] text-[#7B818B] mt-0.5">Live WebSocket Telemetry</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THREAT VECTORS */}
      <section id="problem" className="py-16 border-b border-[#1E2127]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-[#E6E8EB] tracking-tight">
              Threat Vectors Mitigated
            </h2>
            <p className="text-xs text-[#9BA1AC] mt-2 font-mono">
              Standard firewalls and cloud CDNs miss behavioral anomalies. This platform provides deep semantic observability and active defense against automated attacks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#F07178] mb-3">
                <Lock className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Brute-Force & Credential Stuffing</h3>
              <p className="text-xs text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Detects distributed authentication abuse, high-velocity 401 response clusters, and automated dictionary attempts across tenant endpoints.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] mb-3">
                <Search className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Endpoint & Parameter Scanning</h3>
              <p className="text-xs text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Flags adversarial recon bots sweeping non-existent endpoints (.env, /wp-admin, /actuator/heapdump, /.git) before exploits execute.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#FFCB6B] mb-3">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Volumetric Request Bursts</h3>
              <p className="text-xs text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Isolates abusive IPs conducting micro-DDoS bursts, inventory scraping, and denial-of-wallet queries with automated temporary IP blocking.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] mb-3">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Zero-Day Behavioral Outliers</h3>
              <p className="text-xs text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Uses Isolation Forest tree partitioning to identify deviations in latency, payload sizes, and header distributions that signature rules miss.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C3E88D] mb-3">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Real-Time Telemetry Stream</h3>
              <p className="text-xs text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Live WebSocket streaming gives security and platform teams sub-second visibility into every API transaction, status code, and latency distribution.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] mb-3">
                <Globe className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB]">Geographic Threat Intelligence</h3>
              <p className="text-xs text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Autonomous IP geolocation enrichment plots threat origin coordinates onto live interactive maps with ASN risk profiling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section id="how-it-works" className="py-16 border-b border-[#1E2127]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-[#E6E8EB] tracking-tight">
              End-to-End Defense Pipeline
            </h2>
            <p className="text-xs text-[#9BA1AC] mt-2 font-mono">
              From host API execution to machine learning scoring and automated incident resolution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
              <div className="text-[11px] font-mono text-[#82AAFF] mb-1.5">01. INGESTION</div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1">Company API and SDK</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                SDK middleware hooks incoming HTTP requests, recording metadata asynchronously via non-blocking worker threads.
              </p>
            </div>

            <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
              <div className="text-[11px] font-mono text-[#C792EA] mb-1.5">02. VALIDATION</div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1">Secure Collector</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Authenticates CSPRNG keys, enforces rate limits, validates event schemas, and scrubs all passwords and tokens.
              </p>
            </div>

            <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
              <div className="text-[11px] font-mono text-[#FFCB6B] mb-1.5">03. DETECTION</div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1">ML Anomaly Engine</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Isolation Forest partitions features alongside rule heuristics, scoring transactions against project baselines.
              </p>
            </div>

            <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
              <div className="text-[11px] font-mono text-[#F07178] mb-1.5">04. DEFENSE</div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1">Active Defense</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Critical anomalies trigger automated IP blocks, WebSocket dashboard broadcast, and Slack or Discord webhook alerts.
              </p>
            </div>

            <div className="p-4 rounded bg-[#101216] border border-[#1E2127]">
              <div className="text-[11px] font-mono text-[#C3E88D] mb-1.5">05. FORENSICS</div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1">AI Threat Report</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Autonomous threat analysis synthesizes root-cause summaries, remediation checklists, and executive PDF reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ARCHITECTURE SECTION */}
      <section id="architecture" className="py-16 border-b border-[#1E2127]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-[#E6E8EB] tracking-tight">
              Production System Architecture
            </h2>
            <p className="text-xs text-[#9BA1AC] mt-2 font-mono">
              Engineered with decoupled ingestion pipelines, background queues, and strict tenant isolation.
            </p>
          </div>

          <div className="bg-[#101216] border border-[#1E2127] rounded p-6 sm:p-8 overflow-x-auto">
            <div className="min-w-[640px] flex items-center justify-between gap-3 font-mono text-xs">
              <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] text-center w-36">
                <Server className="w-4 h-4 mx-auto text-[#82AAFF] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Customer API</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Flask / FastAPI</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] text-center w-36">
                <Terminal className="w-4 h-4 mx-auto text-[#C792EA] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">SDK Middleware</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Fail-Open Queue</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] text-center w-36">
                <Activity className="w-4 h-4 mx-auto text-[#FFCB6B] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Ingestion API</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Auth / Scoping</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] text-center w-36">
                <Cpu className="w-4 h-4 mx-auto text-[#F07178] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Detection ML</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Isolation Forest</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] text-center w-36">
                <Shield className="w-4 h-4 mx-auto text-[#C3E88D] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Dashboard</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Live WebSocket</p>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-[#1E2127] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-[#9BA1AC] font-mono">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#C3E88D] flex-shrink-0" />
                <span>Zero Database Blocking on Ingest</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#C3E88D] flex-shrink-0" />
                <span>Encrypted Tokens as SHA-256 Only</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#C3E88D] flex-shrink-0" />
                <span>Dual Dialect: SQLite & PostgreSQL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SDK INTEGRATION SECTION */}
      <section id="sdk" className="py-16 border-b border-[#1E2127]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-[#E6E8EB] tracking-tight">
              Integrate in Under 60 Seconds
            </h2>
            <p className="text-xs text-[#9BA1AC] mt-2 font-mono">
              Non-blocking telemetry collection compatible with standard Python and Node.js frameworks.
            </p>
          </div>

          <div className="bg-[#101216] border border-[#1E2127] rounded overflow-hidden max-w-3xl mx-auto">
            {/* Framework Selector Tabs */}
            <div className="flex items-center justify-between bg-[#0A0B0D] px-4 py-2 border-b border-[#1E2127]">
              <div className="flex items-center space-x-1">
                {['flask', 'fastapi', 'django', 'node'].map((fw) => (
                  <button
                    key={fw}
                    onClick={() => setActiveFramework(fw)}
                    className={`px-2.5 py-1 rounded text-xs font-mono uppercase transition-colors ${
                      activeFramework === fw
                        ? 'bg-[#16181D] text-[#82AAFF] font-semibold border border-[#2A2E37]'
                        : 'text-[#7B818B] hover:text-[#E6E8EB]'
                    }`}
                  >
                    {fw}
                  </button>
                ))}
              </div>
              <button
                onClick={() => copyCode(codeSnippets[activeFramework])}
                className="inline-flex items-center space-x-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] bg-[#16181D] hover:bg-[#1E2127] px-2.5 py-1 rounded border border-[#1E2127] font-mono transition-colors"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'COPIED' : 'COPY SNIPPET'}</span>
              </button>
            </div>

            {/* Code Display */}
            <div className="p-4 bg-[#0A0B0D] overflow-x-auto">
              <pre className="text-xs font-mono text-[#E6E8EB] leading-relaxed">
                <code>{codeSnippets[activeFramework]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 6. INTEGRATIONS SECTION */}
      <section id="integrations" className="py-16 border-b border-[#1E2127]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-[#E6E8EB] tracking-tight">
              Supported Integrations
            </h2>
            <p className="text-xs text-[#9BA1AC] mt-2 font-mono">
              Route alerts to your operational workflows with masked secrets and reliable retries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] mb-3 font-semibold text-xs font-mono">
                SL
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB]">Slack Webhooks</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1 leading-relaxed font-mono">
                Instant incident notifications dispatched to targeted channel with severity tags and unblock shortcuts.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] mb-3 font-semibold text-xs font-mono">
                DC
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB]">Discord Webhooks</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1 leading-relaxed font-mono">
                Formatted markdown embed alerts delivered to security operations rooms with zero secret leakage.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#FFCB6B] mb-3 font-semibold text-xs font-mono">
                AI
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB]">Google Gemini</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1 leading-relaxed font-mono">
                Autonomous root-cause threat intelligence report generation with automated heuristic offline fallbacks.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <div className="w-8 h-8 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C3E88D] mb-3 font-semibold text-xs font-mono">
                WH
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB]">Generic HTTPS</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1 leading-relaxed font-mono">
                Custom SIEM and SOAR payload forwarding compatible with Datadog, Splunk, and PagerDuty endpoints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. ARCHITECTURAL GUARANTEES */}
      <section id="docs" className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-[#E6E8EB] tracking-tight">
              Platform Guarantees & Security
            </h2>
            <p className="text-xs text-[#9BA1AC] mt-2 font-mono">
              Core architectural principles ensuring zero risk to production API traffic.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <h4 className="text-xs font-mono font-semibold text-[#82AAFF] mb-2 uppercase">Fail-Open Architecture</h4>
              <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                If the telemetry collector becomes unreachable or experiences latency spikes, SDK middleware fails open immediately. Host API endpoints serve customer requests at full speed without crashing.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <h4 className="text-xs font-mono font-semibold text-[#C792EA] mb-2 uppercase">Strict Tenant Isolation</h4>
              <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                Organizations, users, projects, and credentials are cryptographically isolated. All database queries enforce organization boundaries; cross-tenant access attempts return HTTP 403 Forbidden.
              </p>
            </div>

            <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
              <h4 className="text-xs font-mono font-semibold text-[#C3E88D] mb-2 uppercase">Zero Secret Exposure</h4>
              <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                API credentials are only displayed once upon creation. In database persistence and server logs, all tokens, webhook URLs, and Gemini keys are cryptographically hashed or masked.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center font-mono">
            <Link
              to="/signup"
              className="inline-flex items-center space-x-1.5 px-6 py-2.5 rounded bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] font-bold text-xs transition-colors shadow-xs"
            >
              <span>CREATE ACCOUNT & START DEFENDING APIS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default LandingPage;
