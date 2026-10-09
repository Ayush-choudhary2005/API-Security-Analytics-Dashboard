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
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { onboardingService, projectService } from '../../services/api';
import { getSocket } from '../../services/socket';

export const SdkOnboardingPage = () => {
  const { currentOrg, currentProject, openCreateOrgModal, openCreateProjModal } = useProject();

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
    collector_url="/ingest"
)

@app.route("/api/v1/resource", methods=["GET"])
def get_resource():
    return {"status": "success", "data": []}, 200`,
    fastapi: `# Add to your FastAPI application (main.py):
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware

app = FastAPI()

app.add_middleware(
    SecurityMiddleware,
    api_key="${activeKey}",
    collector_url="/ingest"
)

@app.get("/api/v1/resource")
async def get_resource():
    return {"status": "success", "data": []}`,
    django: `# Add to your Django settings.py:
MIDDLEWARE = [
    'security_sdk.django.SecurityMiddleware',
    # ... other standard middleware
]

SECURITY_API_KEY = "${activeKey}"
SECURITY_COLLECTOR_URL = "/ingest"`,
    node: `// Node.js Express integration:
const express = require('express');
const { securityMiddleware } = require('@security-analytics/node-sdk');

const app = express();

app.use(securityMiddleware({
  apiKey: '${activeKey}',
  collectorUrl: '/ingest'
}));`,
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
                  {fw.id === 'node' ? 'Preview Spec' : 'Python Package'}
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
          <p className="text-xs text-[#9BA1AC] mb-3 ml-7.5 font-mono">
            Execute in your project's active virtual environment:
          </p>
          <div className="ml-7.5 flex items-center justify-between p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#E6E8EB]">
            <code>{installCommand}</code>
            <button
              onClick={() => copyText(installCommand, 2)}
              className="text-[#7B818B] hover:text-[#E6E8EB] inline-flex items-center space-x-1"
            >
              {copiedIndex === 2 ? <Check className="w-4 h-4 text-[#C3E88D]" /> : <Copy className="w-4 h-4" />}
            </button>
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
          <p className="text-xs text-[#9BA1AC] mb-3 ml-7.5 font-mono">
            Export the scoped project credential or load it via <span className="text-[#C792EA]">.env</span>:
          </p>
          <div className="ml-7.5 flex items-center justify-between p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#82AAFF]">
            <code>{envExportCommand}</code>
            <button
              onClick={() => copyText(envExportCommand, 3)}
              className="text-[#7B818B] hover:text-[#E6E8EB] inline-flex items-center space-x-1"
            >
              {copiedIndex === 3 ? <Check className="w-4 h-4 text-[#C3E88D]" /> : <Copy className="w-4 h-4" />}
            </button>
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
            Integrate the hook into your host application entrypoint:
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
