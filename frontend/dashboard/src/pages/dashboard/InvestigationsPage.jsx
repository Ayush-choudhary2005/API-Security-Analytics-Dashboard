import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  FileText,
  Download,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Shield,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Terminal,
  Activity,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { telemetryService, investigationService } from '../../services/api';

export const InvestigationsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const alertIdParam = searchParams.get('alert_id');
  const { currentOrg, currentProject, openCreateOrgModal, openCreateProjModal } = useProject();

  const [alerts, setAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState(alertIdParam || '');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load available alerts for project
  useEffect(() => {
    if (!currentProject?.id) return;
    telemetryService.getAlerts(currentProject.id, 20).then((res) => {
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw?.alerts || []);
      setAlerts(list);
      if (!selectedAlertId && list.length > 0) {
        setSelectedAlertId(list[0].id);
      }
    });
  }, [currentProject?.id]);

  useEffect(() => {
    if (selectedAlertId) {
      handleInvestigate(selectedAlertId);
    }
  }, [selectedAlertId]);

  const handleInvestigate = async (alertId) => {
    if (!alertId) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await investigationService.investigate(alertId);
      setReport(res.data?.report || res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate threat investigation');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    if (!selectedAlertId) return;
    window.open(investigationService.getPdfUrl(selectedAlertId), '_blank');
  };

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId);

  if (!currentProject) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-md p-8 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-[#C792EA]/10 border border-[#C792EA]/30 flex items-center justify-center mx-auto text-[#C792EA]">
          <Search className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Project Selected</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Select or create a project to generate AI threat investigations and forensic dossiers.
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
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Threat Forensics & Dossier Synthesis</h1>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#C792EA] border border-[#2A2E37]">
              <span>AI_ANALYSIS</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Autonomous root-cause threat intelligence powered by Google Gemini and ML heuristics.
          </p>
        </div>

        {report && (
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT EXECUTIVE PDF</span>
          </button>
        )}
      </div>

      {/* Alert Selector Bar */}
      <div className="p-3.5 rounded bg-[#101216] border border-[#1E2127] flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="flex items-center space-x-2.5 w-full sm:w-auto">
          <span className="text-xs font-mono text-[#9BA1AC] flex-shrink-0 uppercase text-[10px] tracking-wider">Target Incident:</span>
          <select
            value={selectedAlertId}
            onChange={(e) => {
              setSelectedAlertId(e.target.value);
              setSearchParams({ alert_id: e.target.value });
            }}
            className="w-full sm:w-96 bg-[#16181D] border border-[#1E2127] rounded px-3 py-1.5 text-xs font-mono text-[#E6E8EB] focus:outline-none focus:border-[#C792EA] transition-colors"
          >
            {alerts.map((alt) => (
              <option key={alt.id} value={alt.id}>
                {alt.id.slice(0, 10)}... | {alt.attack_type?.toUpperCase()} (Score: {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(2) : alt.anomaly_score})
              </option>
            ))}
            {alerts.length === 0 && <option value="">No incident alerts detected</option>}
          </select>
        </div>

        <button
          onClick={() => handleInvestigate(selectedAlertId)}
          disabled={loading || !selectedAlertId}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] disabled:opacity-50 text-[#9BA1AC] hover:text-[#E6E8EB] text-xs font-mono transition-colors border border-[#1E2127]"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C792EA] ${loading ? 'animate-spin' : ''}`} />
          <span>RE-SYNTHESIZE</span>
        </button>
      </div>

      {/* Investigation Details Card */}
      {loading ? (
        <div className="p-14 rounded bg-[#101216] border border-[#1E2127] text-center space-y-3">
          <div className="w-7 h-7 mx-auto border-2 border-[#C792EA] border-t-transparent rounded-full animate-spin"></div>
          <div>
            <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Synthesizing Threat Intelligence</h3>
            <p className="text-[11px] text-[#7B818B] font-mono mt-1">Correlating anomaly features with attack signature heuristics...</p>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 rounded bg-[#101216] border border-[#F07178]/30 text-[#F07178] text-xs font-mono flex items-center space-x-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#F07178]" />
          <span>{error}</span>
        </div>
      ) : report ? (
        <div className="space-y-4">
          {/* Metadata Overview Banner */}
          <div className="p-4 rounded bg-[#101216] border border-[#1E2127] grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase text-[#7B818B]">Incident Severity</p>
              <p className="text-xs font-mono font-semibold text-[#F07178] uppercase mt-1">
                {selectedAlert?.severity || 'HIGH'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-[#7B818B]">Attack Signature</p>
              <p className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase mt-1">
                {selectedAlert?.attack_type || 'ANOMALY'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-[#7B818B]">Target Endpoint</p>
              <p className="text-xs font-mono text-[#82AAFF] mt-1 truncate">
                {selectedAlert?.endpoint || '/api/endpoint'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-[#7B818B]">Attacker Address</p>
              <p className="text-xs font-mono text-[#C792EA] mt-1">
                {selectedAlert?.ip || selectedAlert?.source_ip || '127.0.0.1'}
              </p>
            </div>
          </div>

          {/* AI Root-Cause Report Output */}
          <div className="p-5 rounded bg-[#101216] border border-[#1E2127] space-y-4">
            <div className="flex items-center space-x-2 text-[#E6E8EB] font-mono font-semibold text-xs uppercase tracking-wider pb-3 border-b border-[#1E2127]">
              <Cpu className="w-4 h-4 text-[#C792EA]" />
              <span>Root-Cause Threat Intelligence Dossier</span>
            </div>

            <div className="prose prose-invert max-w-none text-xs text-[#E6E8EB] leading-relaxed">
              <div className="bg-[#0A0B0D] p-4 rounded border border-[#1E2127] whitespace-pre-wrap font-mono text-xs text-[#E6E8EB] leading-relaxed">
                {typeof report === 'string' ? report : report.report || JSON.stringify(report, null, 2)}
              </div>
            </div>

            <div className="pt-3 border-t border-[#1E2127] flex items-center justify-between text-[11px] text-[#7B818B] font-mono">
              <span>SECURITY CLASSIFICATION: CONFIDENTIAL</span>
              <span>EXPORT TARGET: PDF (A4 SPEC)</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-14 rounded bg-[#101216] border border-[#1E2127] text-center text-[#7B818B] text-xs font-mono">
          Select an incident from the registry above to launch automated threat root-cause analysis.
        </div>
      )}
    </div>
  );
};

export default InvestigationsPage;
