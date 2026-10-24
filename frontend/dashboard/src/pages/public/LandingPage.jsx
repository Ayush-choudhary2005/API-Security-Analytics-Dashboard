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
import { useAuth } from '../../context/AuthContext';
import { Hero } from '../../components/landing/Hero';

export const LandingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeFramework, setActiveFramework] = useState('nextjs');

  useEffect(() => {
    const linkRequired = searchParams.get('link_required');
    if (linkRequired === '1') {
      navigate(`/login?${searchParams.toString()}`, { replace: true });
    } else if (!authLoading && isAuthenticated) {
      navigate('/app', { replace: true });
    }
  }, [searchParams, navigate, isAuthenticated, authLoading]);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const codeSnippets = {
    nextjs: `// middleware.ts (Root of Next.js project)
import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

const COLLECTOR_URL = 'https://api-security-analytics-dashboard-vyfe.onrender.com';
const API_KEY = 'ask_prod_your_api_key_here';

let blockedIps = new Set();
let lastSync = 0;

async function syncBlockedIps() {
  if (Date.now() - lastSync < 30000) return;
  lastSync = Date.now();
  try {
    const res = await fetch(\`\${COLLECTOR_URL}/api/v1/blocked-ips\`, {
      headers: { Authorization: \`Bearer \${API_KEY}\` }
    });
    if (res.ok) {
      const data = await res.json();
      blockedIps = new Set(data.blocked_ips || []);
    }
  } catch {}
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Sync in-memory blocklist (zero latency penalty)
  if (event?.waitUntil) event.waitUntil(syncBlockedIps());
  else syncBlockedIps().catch(() => {});

  // 2. Active Ingress Rejection: 403 Forbidden
  if (blockedIps.has(clientIp)) {
    return new NextResponse(JSON.stringify({ error: 'Forbidden', message: 'IP Blocked' }), {
      status: 403,
      headers: { 'content-type': 'application/json' }
    });
  }

  const start = Date.now();
  const response = NextResponse.next();

  // 3. Fire-and-forget telemetry ingestion
  const telemetry = fetch(\`\${COLLECTOR_URL}/ingest\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${API_KEY}\` },
    body: JSON.stringify({
      endpoint: request.nextUrl.pathname,
      method: request.method,
      status_code: response.status,
      latency_ms: Date.now() - start,
      ip: clientIp
    })
  }).catch(() => {});

  if (event?.waitUntil) event.waitUntil(telemetry);
  return response;
}`,
    node: `// Express Security & Telemetry Middleware (Node 18+)
const express = require('express');
const app = express();

const COLLECTOR_URL = 'https://api-security-analytics-dashboard-vyfe.onrender.com';
const API_KEY = 'ask_prod_your_api_key_here';

let blockedIps = new Set();
async function syncBlocklist() {
  try {
    const res = await fetch(\`\${COLLECTOR_URL}/api/v1/blocked-ips\`, {
      headers: { Authorization: \`Bearer \${API_KEY}\` }
    });
    if (res.ok) {
      const data = await res.json();
      blockedIps = new Set(data.blocked_ips || []);
    }
  } catch {}
}
setInterval(syncBlocklist, 30000);
syncBlocklist();

// 1. Pre-route IP enforcement:
app.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
  if (blockedIps.has(ip)) {
    return res.status(403).json({ error: 'Forbidden', message: 'IP Blocked' });
  }

  // 2. Asynchronous telemetry on response finish:
  const start = Date.now();
  res.on('finish', () => {
    fetch(\`\${COLLECTOR_URL}/ingest\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${API_KEY}\` },
      body: JSON.stringify({
        endpoint: req.originalUrl || req.url,
        method: req.method,
        status_code: res.statusCode,
        latency_ms: Date.now() - start,
        ip
      })
    }).catch(() => {});
  });
  next();
});`,
    fastapi: `# FastAPI ASGI Security & Ingress Firewall
import time, json, threading, urllib.request
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
COLLECTOR_URL = "https://api-security-analytics-dashboard-vyfe.onrender.com"
API_KEY = "ask_prod_your_api_key_here"

blocked_ips = set()
def sync_blocklist():
    global blocked_ips
    try:
        req = urllib.request.Request(f"{COLLECTOR_URL}/api/v1/blocked-ips", headers={"Authorization": f"Bearer {API_KEY}"})
        with urllib.request.urlopen(req, timeout=3.0) as r:
            data = json.loads(r.read().decode())
            blocked_ips = set(data.get("blocked_ips", []))
    except Exception:
        pass

def sync_loop():
    while True:
        sync_blocklist()
        time.sleep(30)
threading.Thread(target=sync_loop, daemon=True).start()

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "127.0.0.1")
    if ip in blocked_ips:
        return JSONResponse(status_code=403, content={"error": "Forbidden", "message": "IP Blocked"})

    start = time.time()
    response = await call_next(request)
    latency_ms = (time.time() - start) * 1000.0

    def send_telemetry():
        try:
            payload = json.dumps({"endpoint": request.url.path, "method": request.method, "status_code": response.status_code, "latency_ms": round(latency_ms, 2), "ip": ip}).encode()
            req = urllib.request.Request(f"{COLLECTOR_URL}/ingest", data=payload, headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"})
            urllib.request.urlopen(req, timeout=2.0)
        except Exception:
            pass
    threading.Thread(target=send_telemetry, daemon=True).start()
    return response`,
    flask: `# Flask WSGI Security & Ingress Firewall
import time, json, threading, urllib.request
from flask import Flask, request, g, jsonify

app = Flask(__name__)
COLLECTOR_URL = "https://api-security-analytics-dashboard-vyfe.onrender.com"
API_KEY = "ask_prod_your_api_key_here"

blocked_ips = set()
def sync_blocklist():
    global blocked_ips
    try:
        req = urllib.request.Request(f"{COLLECTOR_URL}/api/v1/blocked-ips", headers={"Authorization": f"Bearer {API_KEY}"})
        with urllib.request.urlopen(req, timeout=3.0) as r:
            data = json.loads(r.read().decode())
            blocked_ips = set(data.get("blocked_ips", []))
    except Exception:
        pass

def sync_loop():
    while True:
        sync_blocklist()
        time.sleep(30)
threading.Thread(target=sync_loop, daemon=True).start()

@app.before_request
def check_ip():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1").split(",")[0].strip()
    if ip in blocked_ips:
        return jsonify({"error": "Forbidden", "message": "IP Blocked"}), 403
    g.telemetry_start = time.time()

@app.after_request
def send_telemetry(response):
    start = getattr(g, "telemetry_start", time.time())
    latency_ms = (time.time() - start) * 1000.0
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1").split(",")[0].strip()

    def dispatch():
        try:
            payload = json.dumps({"endpoint": request.path, "method": request.method, "status_code": response.status_code, "latency_ms": round(latency_ms, 2), "ip": ip}).encode()
            req = urllib.request.Request(f"{COLLECTOR_URL}/ingest", data=payload, headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"})
            urllib.request.urlopen(req, timeout=2.0)
        except Exception:
            pass
    threading.Thread(target=dispatch, daemon=True).start()
    return response`
  };

  return (
    <PublicLayout>
      {/* 1. HERO SECTION (Rebuilt with Two-Column Serif & Live ThreatPanel) */}
      <Hero />

      {/* 2. THREAT VECTORS */}
      <section id="problem" className="relative py-16 md:py-20 border-b border-[#1E2127] overflow-hidden">
        {/* Subtle ambient glow behind threat cards */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-[#82AAFF]/5 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E6E8EB] tracking-tight">
              Threat Vectors Mitigated
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA1AC] mt-2 font-mono leading-relaxed">
              Standard firewalls and cloud CDNs miss behavioral anomalies. This platform provides deep semantic observability and active defense against automated attacks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#F07178]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#F07178] mb-3.5 group-hover:scale-105 group-hover:border-[#F07178]/30 transition-all duration-200">
                <Lock className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                Brute-Force & Credential Stuffing
              </h3>
              <p className="text-xs text-[#9BA1AC] mt-2 leading-relaxed font-mono">
                Detects distributed authentication abuse, high-velocity 401 response clusters, and automated dictionary attempts across tenant endpoints.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#82AAFF]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] mb-3.5 group-hover:scale-105 group-hover:border-[#82AAFF]/30 transition-all duration-200">
                <Search className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                Endpoint & Parameter Scanning
              </h3>
              <p className="text-xs text-[#9BA1AC] mt-2 leading-relaxed font-mono">
                Flags adversarial recon bots sweeping non-existent endpoints (.env, /wp-admin, /actuator/heapdump, /.git) before exploits execute.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#FFCB6B]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#FFCB6B] mb-3.5 group-hover:scale-105 group-hover:border-[#FFCB6B]/30 transition-all duration-200">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                Volumetric Request Bursts
              </h3>
              <p className="text-xs text-[#9BA1AC] mt-2 leading-relaxed font-mono">
                Isolates abusive IPs conducting micro-DDoS bursts, inventory scraping, and denial-of-wallet queries with automated temporary IP blocking.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C792EA]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] mb-3.5 group-hover:scale-105 group-hover:border-[#C792EA]/30 transition-all duration-200">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                Zero-Day Behavioral Outliers
              </h3>
              <p className="text-xs text-[#9BA1AC] mt-2 leading-relaxed font-mono">
                Uses Isolation Forest tree partitioning to identify deviations in latency, payload sizes, and header distributions that signature rules miss.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C3E88D]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C3E88D] mb-3.5 group-hover:scale-105 group-hover:border-[#C3E88D]/30 transition-all duration-200">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                Real-Time Telemetry Stream
              </h3>
              <p className="text-xs text-[#9BA1AC] mt-2 leading-relaxed font-mono">
                Live WebSocket streaming gives security and platform teams sub-second visibility into every API transaction, status code, and latency distribution.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#82AAFF]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] mb-3.5 group-hover:scale-105 group-hover:border-[#82AAFF]/30 transition-all duration-200">
                <Globe className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">
                Geographic Threat Intelligence
              </h3>
              <p className="text-xs text-[#9BA1AC] mt-2 leading-relaxed font-mono">
                Autonomous IP geolocation enrichment plots threat origin coordinates onto live interactive maps with ASN risk profiling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section id="how-it-works" className="relative py-16 md:py-20 border-b border-[#1E2127] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E6E8EB] tracking-tight">
              End-to-End Defense Pipeline
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA1AC] mt-2 font-mono">
              From host API execution to machine learning scoring and automated incident resolution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="group p-4 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#82AAFF]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="text-[11px] font-mono text-[#82AAFF] mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#82AAFF]" />
                <span>01. INGESTION</span>
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1 group-hover:text-white transition-colors">Company API and SDK</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                SDK middleware hooks incoming HTTP requests, recording metadata asynchronously via non-blocking worker threads.
              </p>
            </div>

            <div className="group p-4 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C792EA]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="text-[11px] font-mono text-[#C792EA] mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C792EA]" />
                <span>02. VALIDATION</span>
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1 group-hover:text-white transition-colors">Secure Collector</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Authenticates CSPRNG keys, enforces rate limits, validates event schemas, and scrubs all passwords and tokens.
              </p>
            </div>

            <div className="group p-4 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#FFCB6B]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="text-[11px] font-mono text-[#FFCB6B] mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFCB6B]" />
                <span>03. DETECTION</span>
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1 group-hover:text-white transition-colors">ML Anomaly Engine</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Isolation Forest partitions features alongside rule heuristics, scoring transactions against project baselines.
              </p>
            </div>

            <div className="group p-4 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#F07178]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="text-[11px] font-mono text-[#F07178] mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F07178]" />
                <span>04. DEFENSE</span>
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1 group-hover:text-white transition-colors">Active Defense</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Critical anomalies trigger automated IP blocks, WebSocket dashboard broadcast, and Slack or Discord webhook alerts.
              </p>
            </div>

            <div className="group p-4 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C3E88D]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all duration-200">
              <div className="text-[11px] font-mono text-[#C3E88D] mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D]" />
                <span>05. FORENSICS</span>
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] mb-1 group-hover:text-white transition-colors">AI Threat Report</h4>
              <p className="text-[11px] text-[#9BA1AC] leading-relaxed font-mono">
                Autonomous threat analysis synthesizes root-cause summaries, remediation checklists, and executive PDF reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ARCHITECTURE SECTION */}
      <section id="architecture" className="relative py-16 md:py-20 border-b border-[#1E2127] overflow-hidden">
        {/* Subtle ambient glow behind architecture pipeline */}
        <div
          className="pointer-events-none absolute top-1/2 right-1/4 -translate-y-1/2 w-[450px] h-[350px] rounded-full bg-[#C792EA]/5 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E6E8EB] tracking-tight">
              Production System Architecture
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA1AC] mt-2 font-mono">
              Engineered with decoupled ingestion pipelines, background queues, and strict tenant isolation.
            </p>
          </div>

          <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-colors rounded-3xl p-6 sm:p-8 shadow-2xl overflow-x-auto">
            <div className="min-w-[640px] flex items-center justify-between gap-3 font-mono text-xs">
              <div className="p-4 rounded-2xl bg-[#0A0B0D] border border-[#1E2127] hover:border-[#82AAFF]/40 text-center w-36 transition-colors shadow-inner">
                <Server className="w-4 h-4 mx-auto text-[#82AAFF] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Customer API</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Flask / FastAPI</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-4 rounded-2xl bg-[#0A0B0D] border border-[#1E2127] hover:border-[#C792EA]/40 text-center w-36 transition-colors shadow-inner">
                <Terminal className="w-4 h-4 mx-auto text-[#C792EA] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">SDK Middleware</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Fail-Open Queue</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-4 rounded-2xl bg-[#0A0B0D] border border-[#1E2127] hover:border-[#FFCB6B]/40 text-center w-36 transition-colors shadow-inner">
                <Activity className="w-4 h-4 mx-auto text-[#FFCB6B] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Ingestion API</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Auth / Scoping</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-4 rounded-2xl bg-[#0A0B0D] border border-[#1E2127] hover:border-[#F07178]/40 text-center w-36 transition-colors shadow-inner">
                <Cpu className="w-4 h-4 mx-auto text-[#F07178] mb-1.5" />
                <p className="font-semibold text-[#E6E8EB] text-[11px]">Detection ML</p>
                <p className="text-[10px] text-[#7B818B] mt-0.5">Isolation Forest</p>
              </div>

              <div className="text-[#7B818B] font-bold">&rarr;</div>

              <div className="p-4 rounded-2xl bg-[#0A0B0D] border border-[#1E2127] hover:border-[#C3E88D]/40 text-center w-36 transition-colors shadow-inner">
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
      <section id="sdk" className="relative py-16 md:py-20 border-b border-[#1E2127] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E6E8EB] tracking-tight">
              Integrate in Under 60 Seconds
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA1AC] mt-2 font-mono">
              Non-blocking telemetry collection compatible with standard Python and Node.js frameworks.
            </p>
          </div>

          <div className="bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-300 rounded-3xl shadow-2xl overflow-hidden max-w-3xl mx-auto">
            {/* Framework Selector Tabs */}
            <div className="flex items-center justify-between bg-[#0A0B0D] px-4 py-2.5 border-b border-[#1E2127]">
              <div className="flex items-center space-x-1.5">
                {['nextjs', 'node', 'fastapi', 'flask'].map((fw) => (
                  <button
                    key={fw}
                    onClick={() => setActiveFramework(fw)}
                    className={`px-3 py-1 rounded-full text-xs font-mono uppercase transition-all duration-200 cursor-pointer ${
                      activeFramework === fw
                        ? 'bg-[#16181D] text-[#82AAFF] font-semibold border border-[#2A2E37] shadow-xs'
                        : 'text-[#7B818B] hover:text-[#E6E8EB] hover:bg-[#16181D]/50'
                    }`}
                  >
                    {fw}
                  </button>
                ))}
              </div>
              <button
                onClick={() => copyCode(codeSnippets[activeFramework])}
                className="inline-flex items-center space-x-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] bg-[#16181D] hover:bg-[#1E2127] px-3 py-1.5 rounded-full border border-[#1E2127] hover:border-[#2A2E37] font-mono transition-all duration-200 cursor-pointer"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'COPIED' : 'COPY SNIPPET'}</span>
              </button>
            </div>

            {/* Code Display */}
            <div className="p-5 bg-[#0A0B0D] overflow-x-auto">
              <pre className="text-xs font-mono text-[#E6E8EB] leading-relaxed">
                <code>{codeSnippets[activeFramework]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 6. INTEGRATIONS SECTION */}
      <section id="integrations" className="relative py-16 md:py-20 border-b border-[#1E2127] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E6E8EB] tracking-tight">
              Supported Integrations
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA1AC] mt-2 font-mono">
              Route alerts to your operational workflows with masked secrets and reliable retries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C792EA]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] mb-3.5 font-semibold text-xs font-mono group-hover:scale-105 group-hover:border-[#C792EA]/30 transition-all duration-200">
                SL
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Slack Webhooks</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Instant incident notifications dispatched to targeted channel with severity tags and unblock shortcuts.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#82AAFF]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#82AAFF] mb-3.5 font-semibold text-xs font-mono group-hover:scale-105 group-hover:border-[#82AAFF]/30 transition-all duration-200">
                DC
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Discord Webhooks</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Formatted markdown embed alerts delivered to security operations rooms with zero secret leakage.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#FFCB6B]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#FFCB6B] mb-3.5 font-semibold text-xs font-mono group-hover:scale-105 group-hover:border-[#FFCB6B]/30 transition-all duration-200">
                AI
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Google Gemini</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Autonomous root-cause threat intelligence report generation with automated heuristic offline fallbacks.
              </p>
            </div>

            <div className="group relative p-5 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C3E88D]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <div className="w-9 h-9 rounded-xl bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C3E88D] mb-3.5 font-semibold text-xs font-mono group-hover:scale-105 group-hover:border-[#C3E88D]/30 transition-all duration-200">
                WH
              </div>
              <h4 className="text-xs font-semibold text-[#E6E8EB] group-hover:text-white transition-colors">Generic HTTPS</h4>
              <p className="text-[11px] text-[#9BA1AC] mt-1.5 leading-relaxed font-mono">
                Custom SIEM and SOAR payload forwarding compatible with Datadog, Splunk, and PagerDuty endpoints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. ARCHITECTURAL GUARANTEES */}
      <section id="docs" className="relative py-16 md:py-20 overflow-hidden">
        {/* Subtle ambient bottom glow */}
        <div
          className="pointer-events-none absolute -bottom-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-[#C3E88D]/5 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E6E8EB] tracking-tight">
              Platform Guarantees & Security
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA1AC] mt-2 font-mono">
              Core architectural principles ensuring zero risk to production API traffic.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            <div className="group p-6 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#82AAFF]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <h4 className="text-xs font-mono font-semibold text-[#82AAFF] mb-2 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#82AAFF]" />
                <span>Fail-Open Architecture</span>
              </h4>
              <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                If the telemetry collector becomes unreachable or experiences latency spikes, SDK middleware fails open immediately. Host API endpoints serve customer requests at full speed without crashing.
              </p>
            </div>

            <div className="group p-6 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C792EA]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <h4 className="text-xs font-mono font-semibold text-[#C792EA] mb-2 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C792EA]" />
                <span>Strict Tenant Isolation</span>
              </h4>
              <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                Organizations, users, projects, and credentials are cryptographically isolated. All database queries enforce organization boundaries; cross-tenant access attempts return HTTP 403 Forbidden.
              </p>
            </div>

            <div className="group p-6 rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#C3E88D]/40 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out">
              <h4 className="text-xs font-mono font-semibold text-[#C3E88D] mb-2 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C3E88D]" />
                <span>Zero Secret Exposure</span>
              </h4>
              <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                API credentials are only displayed once upon creation. In database persistence and server logs, all tokens, webhook URLs, and Gemini keys are cryptographically hashed or masked.
              </p>
            </div>
          </div>

          <div className="mt-12 text-center font-mono">
            <a
              href="https://api-security-analytics-dashboard-vyfe.onrender.com/signup"
              className="group inline-flex items-center space-x-2 px-7 py-3 rounded-full bg-[#C792EA] hover:bg-[#d6a5f5] hover:-translate-y-0.5 text-[#0A0B0D] font-bold text-xs transition-all duration-200 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C792EA]"
            >
              <span>CREATE ACCOUNT & START DEFENDING APIS</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
            </a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default LandingPage;
