import React, { useState, useEffect } from 'react';
import {
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Send,
  Zap,
  Radio,
  ExternalLink,
  ArrowRight,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { onboardingService, projectService } from '../../services/api';
import { getSocket } from '../../services/socket';

export const SdkOnboardingPage = () => {
  const { currentProject } = useProject();

  const [framework, setFramework] = useState('flask');
  const [currentStep, setCurrentStep] = useState(1);
  const [activeKey, setActiveKey] = useState('ask_prod_your_key_here');
  const [isConnected, setIsConnected] = useState(false);
  const [firstTelemetryAt, setFirstTelemetryAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testSending, setTestSending] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const fetchOnboardingState = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [onboardRes, projectRes] = await Promise.all([
        onboardingService.get(currentProject.id),
        projectService.get(currentProject.id),
      ]);

      const obData = onboardRes.data?.onboarding || {};
      if (obData.framework) setFramework(obData.framework);
      if (obData.current_step) setCurrentStep(obData.current_step);
      if (onboardRes.data?.telemetry_received) {
        setIsConnected(true);
        setFirstTelemetryAt(onboardRes.data?.first_telemetry_at);
      }

      const keys = projectRes.data?.api_keys || [];
      if (keys.length > 0) {
        setActiveKey(`${keys[0].key_prefix}...`);
      }
    } catch (err) {
      console.error('Failed to load onboarding state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOnboardingState();
  }, [currentProject?.id]);

  // Real-time listener for first telemetry event
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentProject?.id) return;

    const onNewEvent = () => {
      setIsConnected(true);
      setFirstTelemetryAt(new Date().toISOString());
      setCurrentStep(7);
    };

    socket.on('new_event', onNewEvent);
    return () => {
      socket.off('new_event', onNewEvent);
    };
  }, [currentProject?.id]);

  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSelectFramework = async (fw) => {
    setFramework(fw);
    if (!currentProject?.id) return;
    try {
      await onboardingService.update(currentProject.id, {
        current_step: 2,
        framework: fw,
      });
      setCurrentStep(2);
    } catch (err) {
      console.error('Failed to update onboarding step:', err);
    }
  };

  const handleSendTestEvent = async () => {
    if (!currentProject?.id) return;
    setTestSending(true);
    try {
      await onboardingService.sendTestEvent(currentProject.id);
      setIsConnected(true);
      setFirstTelemetryAt(new Date().toISOString());
      setCurrentStep(7);
    } catch (err) {
      console.error('Failed to dispatch test event:', err);
    } finally {
      setTestSending(false);
    }
  };

  const installCommand = 'pip install mlo11y';
  const envExportCommand = `export SECURITY_API_KEY=${activeKey}`;

  const snippetCode = {
    flask: `# Add to your Flask application (app.py):
from flask import Flask
from security_sdk import SecurityMiddleware

app = Flask(__name__)

# Initialize security telemetry middleware
SecurityMiddleware(
    app,
    api_key="${activeKey}",
    collector_url="https://api.sentinapi.io/ingest"
)

@app.route("/api/products", methods=["GET"])
def get_products():
    return {"status": "ok", "items": []}, 200`,
    fastapi: `# Add to your FastAPI application (main.py):
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware

app = FastAPI()

app.add_middleware(
    SecurityMiddleware,
    api_key="${activeKey}",
    collector_url="https://api.sentinapi.io/ingest"
)

@app.get("/api/products")
async def get_products():
    return {"status": "ok"}`,
    django: `# Add to your Django settings.py:
MIDDLEWARE = [
    'security_sdk.django.SecurityMiddleware',
    # ... other standard middleware
]

SECURITY_API_KEY = "${activeKey}"
SECURITY_COLLECTOR_URL = "https://api.sentinapi.io/ingest"`,
    node: `// Node.js Express integration:
const express = require('express');
const { securityMiddleware } = require('@sentinapi/node-sdk');

const app = express();

app.use(securityMiddleware({
  apiKey: '${activeKey}',
  collectorUrl: 'https://api.sentinapi.io/ingest'
}));`,
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">SDK Guided Onboarding</h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect {currentProject?.name} to the active defense pipeline in under 2 minutes.
          </p>
        </div>

        {/* Connection Status Pill */}
        <div
          className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
            isConnected
              ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-300'
              : 'bg-amber-950/80 border-amber-800/80 text-amber-300'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span>{isConnected ? 'Status: Connected' : 'Waiting for First Telemetry Event'}</span>
        </div>
      </div>

      {/* Stepper Wizard Cards */}
      <div className="space-y-4">
        {/* STEP 1: Select Framework */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center space-x-3 mb-4">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">
              1
            </span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Select Web Framework</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'flask', label: 'Flask' },
              { id: 'fastapi', label: 'FastAPI' },
              { id: 'django', label: 'Django' },
              { id: 'node', label: 'Node.js Express' },
            ].map((fw) => (
              <button
                key={fw.id}
                onClick={() => handleSelectFramework(fw.id)}
                className={`p-3 rounded-lg border text-xs font-medium text-left transition-all ${
                  framework === fw.id
                    ? 'bg-cyan-500/10 border-cyan-500/60 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{fw.label}</span>
                  {framework === fw.id && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <span className="text-[10px] text-slate-500">
                  {fw.id === 'node' ? 'Preview' : 'Production SDK'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 2: Install Package */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center space-x-3 mb-2">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">
              2
            </span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Install SDK Package</h3>
          </div>
          <p className="text-xs text-slate-400 mb-3 ml-9">
            Install via pip into your active Python virtual environment:
          </p>
          <div className="ml-9 flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300">
            <code>{installCommand}</code>
            <button
              onClick={() => copyText(installCommand, 2)}
              className="text-slate-400 hover:text-white inline-flex items-center space-x-1"
            >
              {copiedIndex === 2 ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* STEP 3: Configure Environment Variable */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center space-x-3 mb-2">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">
              3
            </span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Configure API Key</h3>
          </div>
          <p className="text-xs text-slate-400 mb-3 ml-9">
            Export your project's credential or load it via <span className="font-mono text-slate-300">.env</span>:
          </p>
          <div className="ml-9 flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300">
            <code>{envExportCommand}</code>
            <button
              onClick={() => copyText(envExportCommand, 3)}
              className="text-slate-400 hover:text-white inline-flex items-center space-x-1"
            >
              {copiedIndex === 3 ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* STEP 4: Add Integration Code */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">
                4
              </span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Attach Security Middleware</h3>
            </div>
            <button
              onClick={() => copyText(snippetCode[framework], 4)}
              className="inline-flex items-center space-x-1 text-xs text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded"
            >
              {copiedIndex === 4 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Code</span>
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3 ml-9">
            Paste this snippet into your host application entrypoint:
          </p>
          <div className="ml-9 p-4 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto">
            <pre className="text-xs font-mono text-cyan-200 leading-relaxed">
              <code>{snippetCode[framework]}</code>
            </pre>
          </div>
        </div>

        {/* STEP 5, 6 & 7: Start, Test & Verify */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center space-x-3 mb-2">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">
              5
            </span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Start Host API & Verify Telemetry</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4 ml-9">
            Launch your web server and send an initial HTTP request. Alternatively, trigger a synthetic verification ping below:
          </p>

          <div className="ml-9 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={handleSendTestEvent}
              disabled={testSending}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-cyan-600/20"
            >
              <Send className={`w-3.5 h-3.5 ${testSending ? 'animate-spin' : ''}`} />
              <span>{testSending ? 'Dispatching Synthetic Telemetry...' : 'Send Synthetic Test Event'}</span>
            </button>

            {isConnected && (
              <div className="flex items-center space-x-2 text-xs text-emerald-400 font-mono">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verified: Telemetry stream detected!</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
