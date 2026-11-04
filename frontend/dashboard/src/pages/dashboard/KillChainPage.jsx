import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, RefreshCw, Shield, Clock, AlertTriangle } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { chainService } from '../../services/api';
import { getSocket } from '../../services/socket';

const SEVERITY_COLOR = {
  high:   'text-red-400 border-red-500/40 bg-red-500/10',
  medium: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  low:    'text-green-400 border-green-500/40 bg-green-500/10',
};

const STATUS_BADGE = {
  active:   'bg-red-500/20 text-red-400 border border-red-500/30',
  resolved: 'bg-green-500/20 text-green-400 border border-green-500/30',
};

function riskColor(score) {
  if (score >= 80) return 'text-red-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-green-400';
}

function relTime(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function ChainCard({ chain, isSelected, onClick }) {
  const stages = Array.isArray(chain.stages) ? chain.stages : [];
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg border p-3 mb-2 transition-all
        ${isSelected
          ? 'border-[#C792EA]/60 bg-[#C792EA]/5'
          : 'border-[#2A2F3A] bg-[#1A1F2A] hover:border-[#3A3F4A]'}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs text-[#82AAFF]">{chain.ip}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono
          ${STATUS_BADGE[chain.status] || STATUS_BADGE.resolved}`}>
          {chain.status?.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-lg font-bold ${riskColor(chain.max_risk)}`}>
          {Math.round(chain.max_risk)}
        </span>
        <span className="text-[10px] text-[#9BA1AC]">risk</span>
        <span className="text-[10px] text-[#9BA1AC] ml-auto">
          {stages.length} stage{stages.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="text-[10px] text-[#6B7280] mt-1">{relTime(chain.updated_at)}</div>
    </div>
  );
}

function Timeline({ chain }) {
  const stages = Array.isArray(chain.stages) ? chain.stages : [];
  const origin = stages.length > 0 ? stages[0].ts : chain.started_at;
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const deltaLabel = i === 0 ? 'T+0s' : `T+${Math.round(s.ts - origin)}s`;
        return (
          <div key={i} className="flex gap-3 items-start">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-[#1E2533] border border-[#2A2F3A]
                flex items-center justify-center text-base">
                {s.icon}
              </div>
              {i < stages.length - 1 && (
                <div className="w-px h-6 bg-[#2A2F3A] mt-1" />
              )}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-[#C792EA] font-semibold">
                  {s.stage}
                </span>
                <span className="text-[10px] font-mono text-[#9BA1AC]">{deltaLabel}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ml-auto
                  ${SEVERITY_COLOR[s.severity] || SEVERITY_COLOR.low} border`}>
                  {s.severity?.toUpperCase()}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-[#ABB2BF]">
                <span className="text-[#82AAFF]">{s.method}</span>{' '}
                <span>{s.endpoint}</span>
                {s.status_code > 0 && (
                  <span className={`ml-2 ${s.status_code < 400 ? 'text-green-400' : 'text-red-400'}`}>
                    → {s.status_code}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-[#6B7280] flex items-center justify-between">
                <div>
                  Risk: <span className={riskColor(s.risk_score)}>{Math.round(s.risk_score)}</span>
                  {' · '}{s.attack_type?.replace(/_/g, ' ')}
                  {s.count > 1 && (
                    <span className="text-[#82AAFF] ml-1">
                      ({s.count} {s.attack_type === 'endpoint_scan' ? 'paths' : 'attempts'})
                    </span>
                  )}
                </div>
                {s.event_id && (
                  <Link
                    to={`/app/investigations?alert_id=${s.event_id}`}
                    className="text-[#C792EA] hover:underline text-[10px] font-mono flex items-center gap-0.5 ml-auto"
                    title="Investigate this stage with AI"
                  >
                    AI Dossier →
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function KillChainPage() {
  const { currentProject, currentOrg, openCreateOrgModal, openCreateProjModal } = useProject();
  const [chains, setChains]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');

  const load = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await chainService.getChains(currentProject.id, params);
      const list = res.data?.chains || [];
      setChains(list);
    } catch (e) {
      console.error('Failed to load chains', e);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id, filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!currentProject?.id) return;
    const socket = getSocket();
    if (!socket) return;

    const onUpdate = (chain) => {
      if (chain?.project_id && chain.project_id !== currentProject.id) return;

      setChains(prev => {
        const idx = prev.findIndex(c => c.id === chain.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = chain;
          return next;
        }
        return [chain, ...prev];
      });
    };

    const eventName = `chain_update_${currentProject.id}`;
    socket.on(eventName, onUpdate);

    return () => {
      socket.off(eventName, onUpdate);
    };
  }, [currentProject?.id]);

  const displayed = filter === 'all' ? chains : chains.filter(c => c.status === filter);

  // Synchronize selected chain with filtered displayed list
  useEffect(() => {
    if (displayed.length === 0) {
      if (selected !== null) setSelected(null);
    } else if (!selected || !displayed.some(c => c.id === selected.id)) {
      setSelected(displayed[0]);
    } else {
      const latest = displayed.find(c => c.id === selected.id);
      if (latest && latest !== selected) {
        setSelected(latest);
      }
    }
  }, [displayed, selected]);

  if (!currentOrg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-[#9BA1AC] text-sm">No organisation yet.</p>
        <button onClick={openCreateOrgModal}
          className="px-4 py-2 bg-[#C792EA] text-black text-xs font-mono rounded">
          Create Organisation
        </button>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-[#9BA1AC] text-sm">No project yet.</p>
        <button onClick={openCreateProjModal}
          className="px-4 py-2 bg-[#82AAFF] text-black text-xs font-mono rounded">
          Create Project
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-[#C792EA]" />
          <h1 className="text-base font-semibold text-[#ABB2BF] font-mono">
            Kill Chain Analysis
          </h1>
          <span className="text-[10px] px-2 py-0.5 bg-[#C792EA]/10 text-[#C792EA]
            border border-[#C792EA]/30 rounded-full font-mono ml-1">
            MITRE ATT&CK
          </span>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'active', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[10px] px-3 py-1 rounded-full font-mono border transition-all
                ${filter === f
                  ? 'bg-[#C792EA]/20 text-[#C792EA] border-[#C792EA]/40'
                  : 'bg-transparent text-[#9BA1AC] border-[#2A2F3A] hover:border-[#9BA1AC]'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded border border-[#2A2F3A] text-[#9BA1AC]
              hover:border-[#9BA1AC] transition-all disabled:opacity-40">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Chain list */}
        <div className="w-64 flex-shrink-0 overflow-y-auto pr-1">
          {loading && (
            <div className="text-center text-[#9BA1AC] text-xs py-8 font-mono">
              Loading chains...
            </div>
          )}
          {!loading && displayed.length === 0 && (
            <div className="text-center py-12">
              <Shield size={32} className="mx-auto text-[#2A2F3A] mb-3" />
              <p className="text-[#6B7280] text-xs font-mono">No attack chains yet.</p>
              <p className="text-[#4B5563] text-[10px] mt-1 font-mono">
                Chains form when an IP triggers 2+ alerts.
              </p>
            </div>
          )}
          {displayed.map(c => (
            <ChainCard key={c.id} chain={c}
              isSelected={selected?.id === c.id}
              onClick={() => setSelected(c)} />
          ))}
        </div>

        {/* Chain detail */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-[#2A2F3A] bg-[#1A1F2A] p-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <GitBranch size={40} className="text-[#2A2F3A] mb-3" />
              <p className="text-[#6B7280] text-sm font-mono">
                Select a chain to view its timeline
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-[#82AAFF]">{selected.ip}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono
                      ${STATUS_BADGE[selected.status] || STATUS_BADGE.resolved}`}>
                      {selected.status?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-[#9BA1AC] font-mono">
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> Started {relTime(selected.started_at)}
                    </span>
                    <span>·</span>
                    <span>Last seen {relTime(selected.updated_at)}</span>
                    <span>·</span>
                    <span>{selected.stage_count} stage{selected.stage_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold font-mono ${riskColor(selected.max_risk)}`}>
                    {Math.round(selected.max_risk)}
                  </div>
                  <div className="text-[10px] text-[#9BA1AC] font-mono">peak risk</div>
                </div>
              </div>
              <hr className="border-[#2A2F3A] mb-4" />
              <h3 className="text-[10px] font-mono text-[#9BA1AC] uppercase tracking-widest mb-3">
                Attack Timeline
              </h3>
              {Array.isArray(selected.stages) && selected.stages.length > 0
                ? <Timeline chain={selected} />
                : <p className="text-[#6B7280] text-xs font-mono">No stages recorded.</p>
              }
              {selected.stages?.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[#2A2F3A]">
                  <Link
                    to={`/app/investigations?alert_id=${
                      [...selected.stages].reverse().find(s => s.event_id && (s.severity === 'high' || s.severity === 'medium'))?.event_id ||
                      selected.stages[selected.stages.length - 1]?.event_id || ''
                    }`}
                    className="text-[11px] font-mono text-[#C792EA] hover:underline
                      flex items-center gap-1">
                    <AlertTriangle size={11} />
                    Investigate final stage with AI →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default KillChainPage;
