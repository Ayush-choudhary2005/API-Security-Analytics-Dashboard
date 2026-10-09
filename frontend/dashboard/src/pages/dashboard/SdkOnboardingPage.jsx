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
  Cpu,
  Download,
  AlertTriangle,
  FileCode,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { onboardingService, projectService } from '../../services/api';
import { getSocket } from '../../services/socket';

export const SdkOnboardingPage = () => {
  const { currentOrg, currentProject, latestCreatedKey, openCreateOrgModal, openCreateProjModal } = useProject();

  const [framework, setFramework] = useState('flask');
  const [currentStep, setCurrentStep] = useState(1);
  const [activeKey, setActiveKey] = useState(latestCreatedKey || '<YOUR_SDK_KEY>');
  const [userCustomKey, setUserCustomKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [firstTelemetryAt, setFirstTelemetryAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testSending, setTestSending] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const collectorUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001';

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

      if (latestCreatedKey) {
        setActiveKey(latestCreatedKey);
      } else {
        const keys = projectRes.data?.api_keys || [];
        if (keys.length > 0) {
          setActiveKey('<YOUR_SDK_KEY>');
        }
      }
    } catch (err) {
      console.error('Failed to load onboarding state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOnboardingState();
  }, [currentProject?.id, latestCreatedKey]);

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

  const getEffectiveKey = () => {
    if (userCustomKey.trim()) return userCustomKey.trim();
    if (latestCreatedKey) return latestCreatedKey;
    return activeKey;
  };

  const effectiveKey = getEffectiveKey();
  const getDownloadSdkUrl = () => {
    if (!currentProject?.id) return '#';
    const param = (latestCreatedKey || userCustomKey.trim())
      ? `?api_key=${encodeURIComponent(latestCreatedKey || userCustomKey.trim())}`
      : '';
    return `${projectService.downloadSdkUrl(currentProject.id)}${param}`;
  };

  const zipInstallCommand = 'pip install .';
  const gitInstallCommand = 'pip install git+https://github.com/Ayush-choudhary2005/API-Security-Analytics-Dashboard.git#subdirectory=sdk';
  const envExportCommand = `export SECURITY_SDK_API_KEY="${effectiveKey}"\nexport SECURITY_SDK_COLLECTOR_URL="${collectorUrl}"`;

  const snippetCode = {
    flask: `# Add to your Flask application (app.py):
from flask import Flask
from security_sdk import SecurityMiddleware

app = Flask(__name__)

# Initialize security telemetry middleware
SecurityMiddleware(
    app,
    api_key="${effectiveKey}",
    collector_url="${collectorUrl}"
)

@app.route("/api/v1/resource", methods=["GET"])
def get_resource():
    return {"status": "success", "data": []}, 200`,
    fastapi: `# Add to your FastAPI application (main.py):
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware

app = FastAPI()

# Attach ASGI telemetry middleware
app.add_middleware(
    SecurityMiddleware,
    api_key="${effectiveKey}",
    collector_url="${collectorUrl}"
)

@app.get("/api/v1/resource")
async def get_resource():
    return {"status": "success", "data": []}`,
    django: `# Add to your Django settings.py:
MIDDLEWARE = [
    'security_sdk.django.SecurityMiddleware',
    # ... other standard middleware
]

SECURITY_SDK_API_KEY = "${effectiveKey}"
SECURITY_SDK_COLLECTOR_URL = "${collectorUrl}"`,
    node: `// Native Node.js Express telemetry forwarder:
const express = require('express');
const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    fetch('${collectorUrl}/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${effectiveKey}'
      },
      body: JSON.stringify({
        endpoint: req.path,
        method: req.method,
        status_code: res.statusCode,
        latency_ms: Date.now() - start,
        ip: req.ip || '127.0.0.1'
      })
    }).catch(() => {});
  });
  next();
});`,
  };

  if (!currentProject) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-md p-8 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-[#82AAFF]/10 border border-[#82AAFF]/30 flex items-center justify-center mx-auto text-[#82AAFF]">
          <Terminal className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Project Selected</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Create or select a project to get your project-scoped SDK integration instructions and API keys.
        </p>
        <div className="pt-2">
          {currentOrg ? (
            <button
              onClick={openCreateProjModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#82AAFF] hover:bg-[#9bbefc] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
            >
              <span>Create Project</span>
            </button>
          ) : (
            <button
              onClick={openCreateOrgModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
            >
              <span>Create Workspace</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">SDK Guided Onboarding</h1>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#82AAFF] border border-[#2A2E37]">
              <span>SETUP_WIZARD</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Integrate {currentProject?.name || 'Active Project'} with the API-Security-Analytics-Dashboard pipeline in under 2 minutes.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Download Preconfigured ZIP button */}
          <a
            href={getDownloadSdkUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#82AAFF] hover:bg-[#9bbdff] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs"
            title="Download complete preconfigured SDK ZIP archive with pre-injected configuration and sample app"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download SDK (.zip)</span>
          </a>

          {/* Connection Status Pill */}
          <div
            className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded border text-xs font-mono transition-colors ${
              isConnected
                ? 'bg-[#101216] border-[#C3E88D]/40 text-[#C3E88D]'
                : 'bg-[#101216] border-[#1E2127] text-[#7B818B]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-[#C3E88D] animate-pulse' : 'bg-[#7B818B]'
              }`}
            />
            <span>{isConnected ? 'STREAM_SYNCHRONIZED' : 'WAITING_FOR_INGEST'}</span>
          </div>
        </div>
      </div>

      {/* Stepper Wizard Cards */}
      <div className="space-y-4">
        {/* STEP 1: Select Framework */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center space-x-2.5 mb-3">
            <span className="w-5 h-5 rounded bg-[#16181D] border border-[#2A2E37] text-[#82AAFF] flex items-center justify-center text-[11px] font-mono font-bold">
              1
            </span>
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Select Web Framework</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 ml-7.5">
            {[
              { id: 'flask', label: 'Flask' },
              { id: 'fastapi', label: 'FastAPI' },
              { id: 'django', label: 'Django' },
              { id: 'node', label: 'Node.js Express' },
            ].map((fw) => (
              <button
                key={fw.id}
                onClick={() => handleSelectFramework(fw.id)}
                className={`p-3 rounded border text-xs text-left transition-colors font-mono ${
                  framework === fw.id
                    ? 'bg-[#16181D] border-[#82AAFF] text-[#E6E8EB]'
                    : 'bg-[#0A0B0D] border-[#1E2127] text-[#7B818B] hover:text-[#E6E8EB] hover:border-[#2A2E37]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[#E6E8EB]">{fw.label}</span>
                  {framework === fw.id && <CheckCircle2 className="w-3.5 h-3.5 text-[#82AAFF]" />}
                </div>
                <span className="text-[10px] text-[#7B818B]">
                  {fw.id === 'node' ? 'Native Forwarder' : 'Python Package'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 2: Install Package */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center space-x-2.5 mb-2">
            <span className="w-5 h-5 rounded bg-[#16181D] border border-[#2A2E37] text-[#82AAFF] flex items-center justify-center text-[11px] font-mono font-bold">
              2
            </span>
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Install SDK Package</h3>
          </div>
          
          <div className="ml-7.5 space-y-3">
            {/* Option A: Preconfigured ZIP */}
            <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#82AAFF] font-mono">Option A: Preconfigured SDK Archive (Recommended)</span>
                <a
                  href={getDownloadSdkUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#82AAFF]/10 hover:bg-[#82AAFF]/20 border border-[#82AAFF]/30 text-[#82AAFF] text-[11px] font-mono font-semibold transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Download .zip</span>
                </a>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono">
                Extract the downloaded ZIP into your application directory and install locally:
              </p>
              <div className="flex items-center justify-between p-2 rounded bg-[#16181D] border border-[#1E2127] font-mono text-xs text-[#E6E8EB]">
                <code>{zipInstallCommand}</code>
                <button
                  onClick={() => copyText(zipInstallCommand, 21)}
                  className="text-[#7B818B] hover:text-[#E6E8EB] inline-flex items-center space-x-1"
                >
                  {copiedIndex === 21 ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Option B: Git pip install */}
            <div className="p-3.5 rounded bg-[#0A0B0D] border border-[#1E2127] space-y-2">
              <span className="text-xs font-semibold text-[#9BA1AC] font-mono">Option B: Direct pip installation via Git</span>
              <div className="flex items-center justify-between p-2 rounded bg-[#16181D] border border-[#1E2127] font-mono text-xs text-[#E6E8EB]">
                <code className="text-[11px] break-all">{gitInstallCommand}</code>
                <button
                  onClick={() => copyText(gitInstallCommand, 22)}
                  className="text-[#7B818B] hover:text-[#E6E8EB] inline-flex items-center space-x-1 ml-2 shrink-0"
                >
                  {copiedIndex === 22 ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 3: Configure Environment Variable */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center space-x-2.5 mb-2">
            <span className="w-5 h-5 rounded bg-[#16181D] border border-[#2A2E37] text-[#82AAFF] flex items-center justify-center text-[11px] font-mono font-bold">
              3
            </span>
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Configure Ingestion Key</h3>
          </div>
          
          <div className="ml-7.5 space-y-3">
            <p className="text-xs text-[#9BA1AC] font-mono">
              Export the scoped project credentials or load them via <span className="text-[#C792EA]">.env</span>:
            </p>

            <div className="flex items-center justify-between p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#82AAFF]">
              <pre className="whitespace-pre-wrap leading-relaxed">
                <code>{envExportCommand}</code>
              </pre>
              <button
                onClick={() => copyText(envExportCommand, 3)}
                className="text-[#7B818B] hover:text-[#E6E8EB] inline-flex items-center space-x-1 shrink-0 ml-3"
              >
                {copiedIndex === 3 ? <Check className="w-4 h-4 text-[#C3E88D]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Key input / notice */}
            {effectiveKey === '<YOUR_SDK_KEY>' ? (
              <div className="p-3 rounded bg-[#16181D] border border-[#E5C07B]/30 space-y-2">
                <div className="flex items-center space-x-1.5 text-xs text-[#E5C07B] font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#E5C07B]" />
                  <span>Custom / Secret Key: Paste your raw key below to update the snippets in real time:</span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={userCustomKey}
                    onChange={(e) => setUserCustomKey(e.target.value)}
                    placeholder="Paste ask_... key here"
                    className="w-full bg-[#0A0B0D] border border-[#2A2E37] rounded px-3 py-1.5 text-xs font-mono text-[#E6E8EB] focus:outline-hidden focus:border-[#82AAFF]"
                  />
                  {userCustomKey && (
                    <button
                      onClick={() => setUserCustomKey('')}
                      className="text-xs text-[#7B818B] hover:text-[#E6E8EB] font-mono px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[#7B818B] font-mono">
                  Tip: If you downloaded the preconfigured ZIP above, your raw key is already pre-injected into <span className="text-[#82AAFF]">config.py</span>.
                </p>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-[11px] text-[#C3E88D] font-mono">
                <Check className="w-3.5 h-3.5 text-[#C3E88D]" />
                <span>Active secret key successfully attached to integration snippet.</span>
              </div>
            )}
          </div>
        </div>

        {/* STEP 4: Add Integration Code */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2.5">
              <span className="w-5 h-5 rounded bg-[#16181D] border border-[#2A2E37] text-[#82AAFF] flex items-center justify-center text-[11px] font-mono font-bold">
                4
              </span>
              <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Attach Telemetry Middleware</h3>
            </div>
            <button
              onClick={() => copyText(snippetCode[framework], 4)}
              className="inline-flex items-center space-x-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] px-2.5 py-1 rounded font-mono transition-colors"
            >
              {copiedIndex === 4 ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Code</span>
            </button>
          </div>
          <p className="text-xs text-[#9BA1AC] mb-3 ml-7.5 font-mono">
            Integrate the middleware into your host application entrypoint:
          </p>
          <div className="ml-7.5 p-4 rounded bg-[#0A0B0D] border border-[#1E2127] overflow-x-auto">
            <pre className="text-xs font-mono text-[#E6E8EB] leading-relaxed">
              <code>{snippetCode[framework]}</code>
            </pre>
          </div>
        </div>

        {/* STEP 5: Start, Test & Verify */}
        <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
          <div className="flex items-center space-x-2.5 mb-2">
            <span className="w-5 h-5 rounded bg-[#16181D] border border-[#2A2E37] text-[#82AAFF] flex items-center justify-center text-[11px] font-mono font-bold">
              5
            </span>
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Deploy Host API & Ingest Verification Event</h3>
          </div>
          <p className="text-xs text-[#9BA1AC] mb-4 ml-7.5 font-mono">
            Launch your web server and dispatch an HTTP request, or trigger a synthetic verification probe right here:
          </p>

          <div className="ml-7.5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              onClick={handleSendTestEvent}
              disabled={testSending}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 rounded bg-[#82AAFF] hover:bg-[#9bbdff] disabled:opacity-50 text-xs font-semibold font-mono text-[#0A0B0D] transition-colors shadow-xs"
            >
              <Send className={`w-3.5 h-3.5 ${testSending ? 'animate-spin' : ''}`} />
              <span>{testSending ? 'TRANSMITTING TELEMETRY...' : 'DISPATCH TEST TELEMETRY PROBE'}</span>
            </button>

            {isConnected && (
              <div className="flex items-center space-x-1.5 text-xs text-[#C3E88D] font-mono">
                <CheckCircle2 className="w-4 h-4 text-[#C3E88D]" />
                <span>TELEMETRY_PIPELINE_VERIFIED</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SdkOnboardingPage;
