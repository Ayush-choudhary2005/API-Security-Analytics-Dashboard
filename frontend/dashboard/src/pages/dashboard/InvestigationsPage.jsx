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
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { telemetryService, investigationService } from '../../services/api';

export const InvestigationsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const alertIdParam = searchParams.get('alert_id');
  const { currentProject } = useProject();

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

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Threat Investigation & Forensics</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Autonomous threat root-cause analysis powered by Google Gemini and ML heuristics.
          </p>
        </div>

        {report && (
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors shadow-sm self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Executive PDF</span>
          </button>
        )}
      </div>

      {/* Alert Selector Bar */}
      <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="flex items-center space-x-2.5 w-full sm:w-auto">
          <span className="text-xs font-medium text-zinc-300 flex-shrink-0">Select Alert:</span>
          <select
            value={selectedAlertId}
            onChange={(e) => {
              setSelectedAlertId(e.target.value);
              setSearchParams({ alert_id: e.target.value });
            }}
            className="w-full sm:w-80 bg-black border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white"
          >
            {alerts.map((alt) => (
              <option key={alt.id} value={alt.id}>
                {alt.id.slice(0, 10)}... | {alt.attack_type?.toUpperCase()} (Score: {alt.anomaly_score?.toFixed ? alt.anomaly_score.toFixed(1) : alt.anomaly_score})
              </option>
            ))}
            {alerts.length === 0 && <option value="">No alerts available</option>}
          </select>
        </div>

        <button
          onClick={() => handleInvestigate(selectedAlertId)}
          disabled={loading || !selectedAlertId}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-zinc-300 hover:text-white text-xs font-medium transition-colors border border-zinc-800"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-Analyze</span>
        </button>
      </div>

      {/* Investigation Details Card */}
      {loading ? (
        <div className="p-14 rounded bg-zinc-950 border border-zinc-800 text-center space-y-3">
          <div className="w-7 h-7 mx-auto border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <div>
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Synthesizing Threat Intelligence</h3>
            <p className="text-[11px] text-zinc-400 mt-1">Correlating anomaly features with attack signature heuristics...</p>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs flex items-center space-x-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-white" />
          <span>{error}</span>
        </div>
      ) : report ? (
        <div className="space-y-4">
          {/* Metadata Overview Banner */}
          <div className="p-4 rounded bg-zinc-950 border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase text-zinc-500">Incident Severity</p>
              <p className="text-xs font-mono font-semibold text-white uppercase mt-0.5">
                {selectedAlert?.severity || 'HIGH'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-zinc-500">Attack Signature</p>
              <p className="text-xs font-mono font-semibold text-white uppercase mt-0.5">
                {selectedAlert?.attack_type || 'ANOMALY'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-zinc-500">Target Endpoint</p>
              <p className="text-xs font-mono text-zinc-300 mt-0.5 truncate">
                {selectedAlert?.endpoint || '/api/endpoint'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-zinc-500">Attacker Address</p>
              <p className="text-xs font-mono text-zinc-400 mt-0.5">
                {selectedAlert?.ip || selectedAlert?.source_ip || '127.0.0.1'}
              </p>
            </div>
          </div>

          {/* AI Root-Cause Report Output */}
          <div className="p-5 rounded bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase tracking-wider pb-3 border-b border-zinc-800">
              <Cpu className="w-4 h-4 text-white" />
              <span>Root-Cause Threat Intelligence Report</span>
            </div>

            <div className="prose prose-invert max-w-none text-xs text-zinc-300 leading-relaxed">
              <div className="bg-black p-4 rounded border border-zinc-800 whitespace-pre-wrap font-mono text-xs text-zinc-200 leading-relaxed">
                {typeof report === 'string' ? report : report.report || JSON.stringify(report, null, 2)}
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Security Classification: CONFIDENTIAL</span>
              <span className="font-mono">Export format: PDF (A4)</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-14 rounded bg-zinc-950 border border-zinc-800 text-center text-zinc-500 text-xs">
          Select an alert above to launch an autonomous threat investigation.
        </div>
      )}
    </div>
  );
};
