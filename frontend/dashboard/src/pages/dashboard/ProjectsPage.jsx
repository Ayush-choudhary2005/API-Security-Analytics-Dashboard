import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderGit2,
  Key,
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Shield,
  UserPlus,
  Lock,
  ExternalLink,
  Download,
  Building2,
  Activity,
  Terminal,
  Code2,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { projectService, organizationService, triggerBlobDownload } from '../../services/api';
import { SdkDownloadModal } from '../../components/sdk/SdkDownloadModal';

export const ProjectsPage = () => {
  const {
    currentOrg,
    organizations,
    projects,
    currentProject,
    latestCreatedKey,
    currentSessionKeyInfo,
    setProjectSessionKey,
    clearProjectSessionKey,
    selectOrganization,
    selectProject,
    refreshProjects,
    openCreateOrgModal,
    openCreateProjModal,
    deleteProject,
    initialLoading,
  } = useProject();

  const orgRole = (currentOrg?.role || 'owner').toLowerCase();
  const canManageKeys = orgRole === 'owner' || orgRole === 'admin';

  const [activeTab, setActiveTab] = useState('keys'); // 'workspaces', 'keys', 'projects', 'members'
  const [projectKeys, setProjectKeys] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [pageError, setPageError] = useState(null);

  const collectorUrl =
    import.meta.env.VITE_COLLECTOR_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  // New Key modal
  const [newKeyRaw, setNewKeyRaw] = useState(null);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('Developer Key');
  const [keyError, setKeyError] = useState(null);
  const [downloadingSingleKey, setDownloadingSingleKey] = useState(false);

  // Member invite modal
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [memberError, setMemberError] = useState(null);

  // SDK Download configuration modal
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadTargetProject, setDownloadTargetProject] = useState(null);
  const [downloadInitialOption, setDownloadInitialOption] = useState(undefined);

  // Re-authentication modal (when deleting project after >5 min session age)
  const [reauthPendingDelete, setReauthPendingDelete] = useState(null);
  const [reauthMethod, setReauthMethod] = useState('password');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState(null);

  const fetchKeys = useCallback(async () => {
    if (!currentProject?.id) return;
    try {
      const res = await projectService.get(currentProject.id);
      const keys = res.data?.keys || res.data?.api_keys || [];
      setProjectKeys(keys);
    } catch (err) {
      console.error('Failed to load project keys:', err);
    }
  }, [currentProject?.id]);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg?.id) return;
    try {
      const res = await organizationService.listMembers(currentOrg.id);
      setMembers(res.data?.members || []);
    } catch (err) {
      console.error('Failed to load organization members:', err);
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    fetchKeys();
    fetchMembers();
  }, [fetchKeys, fetchMembers]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    if (!currentProject?.id) return;
    setLoading(true);
    setKeyError(null);
    try {
      const res = await projectService.createKey(currentProject.id, newKeyName);
      const keyObj = res.data?.key || {};
      const raw = keyObj.raw_key || res.data?.raw_key;
      if (raw) {
        setNewKeyRaw(raw);
        setNewKeyLabel(keyObj.name || newKeyName);
        setProjectSessionKey(currentProject.id, {
          rawKey: raw,
          keyName: keyObj.name || newKeyName,
          keyPrefix: keyObj.key_prefix,
        });
      } else {
        setKeyError('Key provisioned, but raw key secret was not returned.');
      }
      fetchKeys();
    } catch (err) {
      console.error('Failed to generate key:', err);
      setKeyError(err.response?.data?.error || 'Failed to generate key. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRotateSingleKey = async (key) => {
    if (!currentProject?.id || !key?.id) return;
    const confirmed = window.confirm(
      `Are you sure you want to rotate key "${key.name || key.key_prefix}"?\n\nThe existing key will be immediately revoked and a new active key will be generated.`
    );
    if (!confirmed) return;

    setLoading(true);
    setKeyError(null);
    setPageError(null);
    try {
      const rotatedName = `${key.name || 'Key'} (Rotated)`;
      const res = await projectService.rotateKey(currentProject.id, key.id, rotatedName);
      const keyObj = res.data?.key || {};
      const raw = keyObj.raw_key || res.data?.raw_key;
      if (raw) {
        setNewKeyRaw(raw);
        setNewKeyLabel(keyObj.name || rotatedName);
        setProjectSessionKey(currentProject.id, {
          rawKey: raw,
          keyName: keyObj.name || rotatedName,
          keyPrefix: keyObj.key_prefix,
        });
        setShowNewKeyModal(true);
      } else {
        setPageError('Key rotated, but raw secret was not returned.');
      }
      fetchKeys();
    } catch (err) {
      console.error('Failed to rotate key:', err);
      setPageError(err.response?.data?.error || 'Failed to rotate key.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!currentProject?.id) return;
    if (!window.confirm('Revoking this key will immediately reject all SDK telemetry using it. Proceed?')) {
      return;
    }
    setPageError(null);
    try {
      await projectService.revokeKey(currentProject.id, keyId);
      if (
        currentSessionKeyInfo?.keyPrefix &&
        projectKeys.some((k) => k.id === keyId && k.key_prefix === currentSessionKeyInfo.keyPrefix)
      ) {
        clearProjectSessionKey(currentProject.id);
      }
      fetchKeys();
    } catch (err) {
      console.error('Failed to revoke key:', err);
      setPageError(err.response?.data?.error || 'Failed to revoke key.');
    }
  };

  const handleDownloadSingleKey = async () => {
    if (!currentProject?.id || !newKeyRaw) return;
    setDownloadingSingleKey(true);
    setKeyError(null);
    try {
      const result = await projectService.downloadSdk(currentProject.id, {
        mode: 'existing',
        api_key: newKeyRaw,
        key_name: newKeyLabel || newKeyName,
      });
      triggerBlobDownload(result.blob, result.filename);
    } catch (err) {
      console.error('Failed to download SDK with new key:', err);
      setKeyError(err.response?.data?.error || 'Failed to download SDK package.');
    } finally {
      setDownloadingSingleKey(false);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Are you sure you want to delete project "${projectName}"? All API keys and telemetry for this project will be deleted.`)) {
      return;
    }
    setPageError(null);
    const res = await deleteProject(projectId);
    if (!res.success) {
      if (res.code === 'REAUTH_REQUIRED') {
        setReauthPendingDelete({ id: projectId, name: projectName });
        setReauthMethod(res.reauthMethod || 'password');
        setReauthPassword('');
        setReauthError(null);
      } else {
        setPageError(res.error || 'Failed to delete project');
      }
    }
  };

  const handleConfirmReauthDelete = async (e) => {
    e.preventDefault();
    if (!reauthPendingDelete?.id) return;
    setLoading(true);
    setReauthError(null);
    try {
      const res = await deleteProject(reauthPendingDelete.id, reauthPassword);
      if (res.success) {
        setReauthPendingDelete(null);
        setReauthPassword('');
      } else {
        setReauthError(res.error || 'Fresh authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id || !memberEmail.trim()) return;
    setLoading(true);
    setMemberError(null);
    setPageError(null);
    try {
      await organizationService.addMember(currentOrg.id, {
        email: memberEmail.trim(),
        role: memberRole,
      });
      setShowMemberModal(false);
      setMemberEmail('');
      setMemberError(null);
      fetchMembers();
    } catch (err) {
      console.error('Failed to invite member:', err);
      setMemberError(err.response?.data?.error || err.response?.data?.message || 'Failed to invite member. Please check the email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!currentOrg?.id) return;
    if (!window.confirm('Remove this member from the organization?')) return;
    setPageError(null);
    try {
      await organizationService.removeMember(currentOrg.id, memberId);
      fetchMembers();
    } catch (err) {
      console.error('Failed to remove member:', err);
      setPageError(err.response?.data?.error || 'Failed to remove member.');
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#1E2127] border-t-[#C792EA] rounded-full animate-spin"></div>
        <p className="text-xs font-mono text-[#9BA1AC] tracking-wider uppercase text-[11px]">
          Loading Project Credentials & Keys...
        </p>
      </div>
    );
  }

  // Empty state: No workspace
  if (!currentOrg || organizations.length === 0) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-3xl p-8 max-w-xl mx-auto mt-8 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-[#C792EA]/10 border border-[#C792EA]/30 flex items-center justify-center mx-auto text-[#C792EA]">
          <FolderGit2 className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Workspace Created</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Create an organization workspace before provisioning projects and API keys.
        </p>
        <div className="pt-2">
          <button
            onClick={openCreateOrgModal}
            className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-full bg-[#C792EA] hover:bg-[#d6a5f7] text-xs text-[#0A0B0D] font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
          >
            <span>Create Workspace</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2127] pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Credentials & Project Governance</h1>
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#16181D] text-[#C792EA] border border-[#2A2E37]">
              <span>ORG_WORKSPACE</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Provision SDK authentication tokens, switch workspaces and projects, and grant RBAC access in {currentOrg?.name || 'Active Workspace'}.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="inline-flex items-center space-x-1 bg-[#101216] border border-[#1E2127] p-1 rounded-full self-start sm:self-auto font-mono text-xs overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab('workspaces')}
            className={`px-3.5 py-1.5 rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === 'workspaces'
                ? 'bg-[#16181D] text-[#C792EA] font-semibold border border-[#2A2E37] shadow-xs'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            Workspaces ({organizations.length})
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-3.5 py-1.5 rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === 'projects'
                ? 'bg-[#16181D] text-[#82AAFF] font-semibold border border-[#2A2E37] shadow-xs'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-3.5 py-1.5 rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === 'keys'
                ? 'bg-[#16181D] text-[#C792EA] font-semibold border border-[#2A2E37] shadow-xs'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            SDK API Keys ({projectKeys.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3.5 py-1.5 rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === 'members'
                ? 'bg-[#16181D] text-[#C3E88D] font-semibold border border-[#2A2E37] shadow-xs'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            Members ({members.length})
          </button>
        </div>
      </div>

      {/* Active Workspace Governance Card */}
      <div className="rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] p-5 shadow-sm transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#C792EA]/10 border border-[#C792EA]/30 flex items-center justify-center text-[#C792EA]">
                <Building2 className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-[#E6E8EB] tracking-tight">{currentOrg.name}</h2>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#C792EA]/10 text-[#C792EA] border border-[#C792EA]/30 font-semibold">
                {currentOrg.role || 'OWNER'}
              </span>
              <span className="text-[10px] font-mono text-[#7B818B] bg-[#16181D] px-2 py-0.5 rounded-full border border-[#1E2127]">
                slug: {currentOrg.slug || 'default'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#9BA1AC] pt-0.5">
              <div className="flex items-center space-x-1.5">
                <span className="text-[#7B818B]">Workspace ID:</span>
                <code className="text-[#82AAFF] bg-[#16181D] px-2 py-0.5 rounded border border-[#1E2127] text-[11px]">
                  {currentOrg.id}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentOrg.id, 'active_org_id')}
                  className="p-1 text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer transition-colors"
                  title="Copy Full Workspace ID"
                >
                  {copiedKey === 'active_org_id' ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {currentOrg.created_at && (
                <span className="text-[#7B818B] text-[11px]">
                  Created: {new Date(currentOrg.created_at * 1000).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Workspace Metrics & Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-4 px-4 py-2 bg-[#16181D] rounded-xl border border-[#1E2127] text-xs font-mono">
              <div>
                <span className="text-[#7B818B] text-[10px] block uppercase">Projects</span>
                <span className="text-sm font-bold text-[#82AAFF]">{projects.length}</span>
              </div>
              <div className="w-px h-6 bg-[#1E2127]" />
              <div>
                <span className="text-[#7B818B] text-[10px] block uppercase">Members</span>
                <span className="text-sm font-bold text-[#C3E88D]">{members.length}</span>
              </div>
              <div className="w-px h-6 bg-[#1E2127]" />
              <div>
                <span className="text-[#7B818B] text-[10px] block uppercase">Workspaces</span>
                <span className="text-sm font-bold text-[#C792EA]">{organizations.length}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateOrgModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-full bg-[#C792EA] hover:bg-[#d6a5f7] text-xs font-semibold text-[#0A0B0D] font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Workspace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Page Error Banner */}
      {pageError && (
        <div className="p-3.5 rounded-2xl bg-[#F07178]/10 border border-[#F07178]/30 text-xs font-mono text-[#F07178] flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#F07178]" />
            <span>{pageError}</span>
          </div>
          <button
            onClick={() => setPageError(null)}
            className="cursor-pointer text-[#7B818B] hover:text-[#E6E8EB] p-1 font-mono text-xs transition-colors ml-4"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 0: WORKSPACES */}
      {activeTab === 'workspaces' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#101216] border border-[#1E2127] p-4 rounded-2xl">
            <div>
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-[#C792EA]" />
                <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">
                  Organization Workspaces ({organizations.length})
                </h3>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">
                Multi-tenant isolated workspaces. Each workspace isolates its own projects, team members, and API keys.
              </p>
            </div>
            <button
              onClick={openCreateOrgModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] text-xs font-semibold font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Workspace</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {organizations.map((org) => {
              const isActive = currentOrg?.id === org.id;
              const projectCount = org.project_count !== undefined ? org.project_count : (isActive ? projects.length : 0);
              const memberCount = org.member_count !== undefined ? org.member_count : (isActive ? members.length : 1);

              return (
                <div
                  key={org.id}
                  className={`p-5 rounded-2xl bg-[#101216] border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
                    isActive
                      ? 'border-[#C792EA] bg-[#16181D]'
                      : 'border-[#1E2127] hover:border-[#2A2E37]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#16181D] border border-[#2A2E37] text-[#C792EA] font-semibold">
                      {org.role || 'OWNER'}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] font-mono text-[#C3E88D] uppercase tracking-wider font-semibold border border-[#C3E88D]/30 px-2 py-0.5 rounded-full bg-[#C3E88D]/10">
                        ACTIVE WORKSPACE
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#7B818B]">
                        Workspace
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1 truncate">{org.name}</h3>
                  <div className="text-[11px] font-mono text-[#7B818B] mb-3">slug: {org.slug || 'default'}</div>

                  <div className="space-y-2 mb-4 bg-[#0A0B0D] p-2.5 rounded-xl border border-[#1E2127] text-xs font-mono">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#7B818B]">Workspace ID:</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-[#82AAFF] truncate max-w-[130px]">{org.id.slice(0, 14)}...</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(org.id, `org_${org.id}`)}
                          className="p-1 text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer"
                          title="Copy Full Workspace ID"
                        >
                          {copiedKey === `org_${org.id}` ? (
                            <Check className="w-3 h-3 text-[#C3E88D]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#9BA1AC]">
                      <span className="text-[#7B818B]">Projects:</span>
                      <span className="font-semibold text-[#E6E8EB]">{projectCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#9BA1AC]">
                      <span className="text-[#7B818B]">Members:</span>
                      <span className="font-semibold text-[#E6E8EB]">{memberCount}</span>
                    </div>
                    {org.created_at && (
                      <div className="flex items-center justify-between text-[10px] text-[#7B818B]">
                        <span>Created:</span>
                        <span>{new Date(org.created_at * 1000).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#1E2127] flex items-center justify-between">
                    <button
                      onClick={() => selectOrganization(org)}
                      disabled={isActive}
                      className={`w-full text-xs font-mono font-semibold py-1.5 px-3 rounded-full transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'bg-[#1E2127] text-[#C3E88D] border border-[#C3E88D]/20 cursor-default text-center'
                          : 'bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] hover:-translate-y-0.5 shadow-xs text-center'
                      }`}
                    >
                      {isActive ? 'Current Context' : 'Switch to Workspace'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 1: SDK KEYS */}
      {activeTab === 'keys' && (
        !currentProject ? (
          <div className="py-16 text-center space-y-3 bg-[#101216] border border-[#1E2127] rounded-3xl p-6 shadow-sm">
            <Key className="w-8 h-8 text-[#7B818B] mx-auto opacity-60" />
            <h3 className="text-sm font-semibold text-[#E6E8EB]">No Project Selected</h3>
            <p className="text-xs text-[#9BA1AC] max-w-sm mx-auto">
              Select or create a project to inspect and generate SDK API keys.
            </p>
            <div className="pt-2">
              {projects.length > 0 ? (
                <button
                  onClick={() => setActiveTab('projects')}
                  className="px-4 py-1.5 bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold rounded-full font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
                >
                  Choose a Project
                </button>
              ) : (
                <button
                  onClick={openCreateProjModal}
                  className="px-4 py-1.5 bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold rounded-full font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs"
                >
                  Create Project
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Session Key Banner */}
            {latestCreatedKey && (
              <div className="p-4 rounded-2xl bg-[#C3E88D]/10 border border-[#C3E88D]/30 shadow-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[#C3E88D] animate-pulse" />
                    <span className="text-xs font-mono font-semibold text-[#C3E88D] uppercase tracking-wider">
                      Active Session Key ({currentSessionKeyInfo?.keyName || 'SDK Key'})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(latestCreatedKey, 'active_session_key')}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#101216] border border-[#2A2E37] text-xs font-mono text-[#E6E8EB] hover:border-[#C3E88D] transition-colors cursor-pointer"
                    >
                      {copiedKey === 'active_session_key' ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'active_session_key' ? 'Copied' : 'Copy Key'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => clearProjectSessionKey(currentProject?.id)}
                      className="px-2.5 py-1 rounded bg-[#101216] border border-[#2A2E37] text-xs font-mono text-[#9BA1AC] hover:text-[#F07178] hover:border-[#F07178]/40 transition-colors cursor-pointer"
                      title="Remove plaintext key from in-memory session state"
                    >
                      Clear from Session
                    </button>
                  </div>
                </div>
                <div className="bg-[#0A0B0D] p-2.5 rounded-lg border border-[#1E2127] font-mono text-xs text-[#C3E88D] break-all select-all">
                  {latestCreatedKey}
                </div>
                <p className="text-[11px] text-[#9BA1AC] font-mono">
                  Scoped to <span className="text-[#E6E8EB]">{currentProject?.name}</span> in memory only. Database stores only SHA-256 hashes; raw keys are never shown again after this session ends.
                </p>
              </div>
            )}

            {/* SDK Collector & Ingestion Parameters Card */}
            <div className="rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] p-4 sm:p-5 shadow-sm transition-all duration-200 space-y-3">
              <div className="flex items-center justify-between border-b border-[#1E2127] pb-2.5">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-[#82AAFF]" />
                  <h4 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">
                    SDK Collector & Ingestion Parameters
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-[#7B818B] bg-[#16181D] px-2 py-0.5 rounded border border-[#1E2127]">
                  REST Ingest: POST /ingest
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-[#0A0B0D] p-3 rounded-xl border border-[#1E2127] space-y-1">
                  <div className="text-[10px] text-[#7B818B] uppercase">Collector Base URL</div>
                  <div className="flex items-center justify-between text-[#82AAFF]">
                    <span className="truncate">{collectorUrl}</span>
                    <button
                      onClick={() => copyToClipboard(collectorUrl, 'param_collector')}
                      className="ml-2 text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer"
                      title="Copy Collector URL"
                    >
                      {copiedKey === 'param_collector' ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="bg-[#0A0B0D] p-3 rounded-xl border border-[#1E2127] space-y-1">
                  <div className="text-[10px] text-[#7B818B] uppercase">Target Project ID</div>
                  <div className="flex items-center justify-between text-[#82AAFF]">
                    <span className="truncate">{currentProject?.id}</span>
                    <button
                      onClick={() => copyToClipboard(currentProject?.id, 'param_pid')}
                      className="ml-2 text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer"
                      title="Copy Project ID"
                    >
                      {copiedKey === 'param_pid' ? <Check className="w-3.5 h-3.5 text-[#C3E88D]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A0B0D] p-3 rounded-xl border border-[#1E2127] space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#7B818B] uppercase">Environment Variables (Bash / Docker / .env)</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `export SECURITY_SDK_PROJECT_ID="${currentProject?.id}"\nexport SECURITY_SDK_COLLECTOR_URL="${collectorUrl}"\nexport SECURITY_SDK_API_KEY="${latestCreatedKey || '<YOUR_SDK_KEY>'}"`,
                        'param_env'
                      )
                    }
                    className="inline-flex items-center space-x-1 text-[11px] text-[#C792EA] hover:text-[#d6a5f7] cursor-pointer"
                  >
                    {copiedKey === 'param_env' ? <Check className="w-3 h-3 text-[#C3E88D]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'param_env' ? 'Copied Snippet' : 'Copy Snippet'}</span>
                  </button>
                </div>
                <div className="text-[11px] text-[#9BA1AC] space-y-0.5 select-all">
                  <div>export SECURITY_SDK_PROJECT_ID="{currentProject?.id}"</div>
                  <div>export SECURITY_SDK_COLLECTOR_URL="{collectorUrl}"</div>
                  <div>export SECURITY_SDK_API_KEY="{latestCreatedKey || '<YOUR_SDK_KEY>'}"</div>
                </div>
              </div>
            </div>

            {/* SDK Credentials Table */}
            <div className="rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] p-5 shadow-sm transition-all duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-[#1E2127] pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <Key className="w-4 h-4 text-[#C792EA]" />
                    <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">
                      SDK Credentials: {currentProject?.name} ({projectKeys.length})
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#9BA1AC] font-mono mt-1">
                    CSPRNG 128-bit secret keys. Cryptographically hashed using SHA-256 in persistence layer.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadTargetProject(currentProject);
                      setDownloadInitialOption(canManageKeys ? (latestCreatedKey ? 'session' : 'new') : 'template');
                      setShowDownloadModal(true);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-[#82AAFF] hover:bg-[#9bbdff] text-[#0A0B0D] text-xs font-semibold font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs cursor-pointer"
                    title="Configure and download SDK archive containing ready-to-run middleware and config"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download SDK (.zip)</span>
                  </button>
                  {canManageKeys ? (
                    <button
                      onClick={() => {
                        setNewKeyRaw(null);
                        setNewKeyLabel('');
                        setKeyError(null);
                        setShowNewKeyModal(true);
                      }}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] text-xs font-semibold font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Key</span>
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#16181D] text-[#7B818B] border border-[#1E2127] text-xs font-mono"
                      title="Requires Workspace Owner or Admin role to manage keys"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Read-Only ({orgRole})</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-[#1E2127]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#16181D] text-[#7B818B] text-[10px] uppercase tracking-wider border-b border-[#1E2127]">
                    <tr>
                      <th className="py-2.5 px-4">Key Label</th>
                      <th className="py-2.5 px-4">Secret Prefix</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Last Active</th>
                      <th className="py-2.5 px-4">Provisioned</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2127]/60 bg-[#101216]">
                    {projectKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-[#16181D]/60 transition-colors">
                        <td className="py-2.5 px-4 text-[#E6E8EB] font-sans font-medium">{k.name}</td>
                        <td className="py-2.5 px-4 text-[#82AAFF]">
                          {k.key_prefix}
                          <button
                            onClick={() => copyToClipboard(k.key_prefix, k.id)}
                            className="ml-2 text-[#7B818B] hover:text-[#E6E8EB] inline-flex align-middle cursor-pointer"
                            title="Copy prefix"
                          >
                            {copiedKey === k.id ? <Check className="w-3 h-3 text-[#C3E88D]" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                              k.status === 'active'
                                ? 'bg-[#C3E88D]/15 text-[#C3E88D] border-[#C3E88D]/30'
                                : 'bg-[#16181D] text-[#7B818B] border-[#1E2127]'
                            }`}
                          >
                            {k.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-xs">
                          {k.last_used_at ? (
                            <div className="flex items-center space-x-1.5">
                              {Date.now() / 1000 - k.last_used_at < 600 ? (
                                <>
                                  <span className="w-2 h-2 rounded-full bg-[#C3E88D] animate-pulse" />
                                  <span className="text-[#C3E88D] font-semibold">Active now</span>
                                </>
                              ) : (
                                <span className="text-[#9BA1AC]">{new Date(k.last_used_at * 1000).toLocaleString()}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#7B818B]">Never used</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-[#7B818B] text-[11px]">
                          {k.created_at ? new Date(k.created_at * 1000).toLocaleDateString() : 'Active'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-sans">
                          {k.status === 'active' ? (
                            canManageKeys ? (
                              <div className="inline-flex items-center space-x-2">
                                <button
                                  onClick={() => handleRotateSingleKey(k)}
                                  disabled={loading}
                                  className="inline-flex items-center space-x-1 text-xs text-[#82AAFF] hover:text-[#9bbdff] hover:underline font-mono cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Rotate this key (revokes current key and provisions a replacement)"
                                >
                                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                  <span>Rotate</span>
                                </button>
                                <span className="text-[#2A2E37]">|</span>
                                <button
                                  onClick={() => handleRevokeKey(k.id)}
                                  disabled={loading}
                                  className="text-xs text-[#F07178] hover:underline font-mono cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Permanently revoke this key"
                                >
                                  Revoke
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-[#7B818B] font-mono" title="Requires Owner or Admin role">
                                Admin Only
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-[#7B818B] font-mono">Revoked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {projectKeys.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-[#7B818B] font-mono">
                          {canManageKeys ? (
                            <>
                              <span>Zero API keys generated yet.{' '}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setKeyError(null);
                                  setNewKeyRaw(null);
                                  setNewKeyLabel('');
                                  setShowNewKeyModal(true);
                                }}
                                className="text-[#C792EA] hover:underline font-semibold cursor-pointer"
                              >
                                Click here to create a new key
                              </button>
                              <span> to provision an ingestion credential.</span>
                            </>
                          ) : (
                            <span>Zero API keys generated yet. Ask a Workspace Owner or Admin to provision a key.</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* TAB 2: PROJECTS LIST */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#101216] border border-[#1E2127] p-3 rounded">
            <div>
              <span className="text-xs font-mono text-[#E6E8EB] font-semibold">Projects in {currentOrg?.name || 'Workspace'}</span>
              <p className="text-[11px] text-[#9BA1AC] font-mono">Scope environments for SDK keys, telemetry pipelines, and rate limiting</p>
            </div>
            <button
              onClick={openCreateProjModal}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Project</span>
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-[#101216] border border-[#1E2127] rounded p-6">
              <FolderGit2 className="w-8 h-8 text-[#7B818B] mx-auto opacity-60" />
              <h3 className="text-sm font-semibold text-[#E6E8EB]">No Projects in this Workspace</h3>
              <p className="text-xs text-[#9BA1AC] max-w-sm mx-auto">
                Create your first project to automatically generate your initial SDK API key and start streaming telemetry.
              </p>
              <div className="pt-2">
                <button
                  onClick={openCreateProjModal}
                  className="px-3.5 py-1.5 bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold rounded font-mono transition-colors cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className={`p-5 rounded-2xl bg-[#101216] border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
                    currentProject?.id === proj.id
                      ? 'border-[#82AAFF] bg-[#16181D]'
                      : 'border-[#1E2127] hover:border-[#2A2E37]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-[#82AAFF] bg-[#16181D] border border-[#2A2E37] px-2 py-0.5 rounded-full">
                      {proj.id.slice(0, 12)}
                    </span>
                    {currentProject?.id === proj.id && (
                      <span className="text-[10px] font-mono text-[#C3E88D] uppercase tracking-wider font-semibold border border-[#C3E88D]/30 px-2 py-0.5 rounded-full bg-[#C3E88D]/10">ACTIVE PROJECT</span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1">{proj.name}</h3>
                  <p className="text-xs text-[#9BA1AC] mb-4 line-clamp-2">{proj.description || 'No description provided'}</p>

                  <div className="pt-3 border-t border-[#1E2127] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => selectProject(proj)}
                        className={`text-xs font-mono font-semibold px-3.5 py-1 rounded-full transition-all duration-200 hover:-translate-y-0.5 shadow-xs cursor-pointer ${
                          currentProject?.id === proj.id
                            ? 'bg-[#82AAFF] text-[#0A0B0D]'
                            : 'bg-[#16181D] text-[#9BA1AC] hover:text-[#E6E8EB] border border-[#1E2127] hover:border-[#2A2E37]'
                        }`}
                      >
                        {currentProject?.id === proj.id ? 'Selected' : 'Switch Context'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDownloadTargetProject(proj);
                          setDownloadInitialOption(undefined);
                          setShowDownloadModal(true);
                        }}
                        className="text-xs font-mono text-[#82AAFF] hover:text-[#a0c2ff] inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#16181D] border border-[#1E2127] hover:border-[#2A2E37] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
                        title="Configure and download SDK archive for this project"
                      >
                        <Download className="w-3 h-3" />
                        <span>SDK</span>
                      </button>
                    </div>
                    <button
                      onClick={() => handleDeleteProject(proj.id, proj.name)}
                      className="text-xs text-[#F07178] hover:text-red-400 font-mono transition-colors cursor-pointer"
                      title="Delete project"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEMBERS */}
      {activeTab === 'members' && (
        <div className="rounded-2xl bg-[#101216] border border-[#1E2127] hover:border-[#2A2E37] p-5 shadow-sm transition-all duration-200">
          <div className="flex items-center justify-between mb-4 border-b border-[#1E2127] pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-[#C3E88D]" />
                <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Organization Members</h3>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">Team members with workspace access privileges</p>
            </div>
            <button
              onClick={() => {
                setMemberError(null);
                setShowMemberModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-[#C3E88D] hover:bg-[#d4f2aa] text-[#0A0B0D] text-xs font-semibold font-mono transition-all duration-200 hover:-translate-y-0.5 shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite Member</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-[#1E2127]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#16181D] text-[#7B818B] text-[10px] uppercase tracking-wider border-b border-[#1E2127]">
                <tr>
                  <th className="py-2.5 px-4 font-sans">User</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Joined</th>
                  <th className="py-2.5 px-4 text-right font-sans">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2127]/60 bg-[#101216]">
                {members.map((m) => (
                  <tr key={m.id || m.user_id} className="hover:bg-[#16181D]/60 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-[#E6E8EB] font-sans">{m.full_name || 'Team Member'}</td>
                    <td className="py-2.5 px-4 text-[#82AAFF]">{m.email}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#16181D] text-[#C792EA] border border-[#2A2E37]">
                        {m.role || 'member'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#7B818B] text-[11px]">
                      {m.joined_at ? new Date(m.joined_at * 1000).toLocaleDateString() : 'Active'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {m.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id || m.id)}
                          className="text-xs text-[#F07178] hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Key Created */}
      {showNewKeyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNewKeyModal(false);
              setNewKeyRaw(null);
              setKeyError(null);
            }
          }}
        >
          <div className="bg-[#101216] border border-[#2A2E37] rounded p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-[#E6E8EB] font-semibold">
                <Key className="w-5 h-5 text-[#C792EA]" />
                <span className="font-mono text-sm">{newKeyRaw ? 'API Key Generated' : 'Create API Key'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewKeyModal(false);
                  setNewKeyRaw(null);
                  setKeyError(null);
                }}
                className="text-[#7B818B] hover:text-[#E6E8EB] p-1 font-mono cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {keyError && (
              <div className="mb-3 p-2.5 rounded bg-[#F07178]/10 border border-[#F07178]/30 text-xs font-mono text-[#F07178]">
                {keyError}
              </div>
            )}

            {newKeyRaw ? (
              <div className="space-y-4">
                <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                  Copy this key immediately. For your security,{' '}
                  <span className="text-[#F07178] font-bold">it will never be displayed again</span>.
                </p>
                <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#82AAFF] break-all select-all flex items-center justify-between">
                  <span>{newKeyRaw}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(newKeyRaw, 'modal_key')}
                    className="ml-3 p-1 text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer"
                  >
                    {copiedKey === 'modal_key' ? <Check className="w-4 h-4 text-[#C3E88D]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-[#1E2127]">
                  <button
                    type="button"
                    disabled={downloadingSingleKey}
                    onClick={handleDownloadSingleKey}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-[#82AAFF] hover:bg-[#9bbdff] disabled:opacity-50 text-xs font-semibold text-[#0A0B0D] font-mono transition-colors w-full sm:w-auto justify-center cursor-pointer"
                    title="Download SDK preconfigured with this newly generated key"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingSingleKey ? 'Preparing...' : 'Download SDK with this Key'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setNewKeyRaw(null);
                      setNewKeyLabel('');
                      setKeyError(null);
                    }}
                    className="px-4 py-1.5 rounded-full bg-[#C792EA] hover:bg-[#d6a5f5] text-xs font-semibold text-[#0A0B0D] font-mono cursor-pointer transition-colors w-full sm:w-auto text-center"
                  >
                    I Have Saved This Key
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Key Label Name</label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production Ingestion Key"
                    className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors font-mono"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2 border-t border-[#1E2127]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setKeyError(null);
                    }}
                    className="px-3 py-1.5 text-xs text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 text-xs bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] font-semibold font-mono rounded cursor-pointer transition-colors"
                  >
                    {loading ? 'Generating...' : 'Generate Key'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Invite Member */}
      {showMemberModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMemberModal(false);
              setMemberError(null);
            }
          }}
        >
          <div className="bg-[#101216] border border-[#2A2E37] rounded p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-[#E6E8EB] font-mono">Invite Organization Member</h3>
              <button
                type="button"
                onClick={() => {
                  setShowMemberModal(false);
                  setMemberError(null);
                }}
                className="text-[#7B818B] hover:text-[#E6E8EB] p-1 font-mono text-xs cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#9BA1AC] mb-4">
              Add a teammate to <span className="text-[#82AAFF] font-medium">{currentOrg?.name}</span>.
            </p>

            {memberError && (
              <div className="mb-3.5 p-2.5 rounded bg-[#F07178]/10 border border-[#F07178]/30 text-xs font-mono text-[#F07178] flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{memberError}</span>
              </div>
            )}

            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1 uppercase tracking-wider text-[10px]">Teammate Email</label>
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={memberEmail}
                  onChange={(e) => {
                    setMemberEmail(e.target.value);
                    if (memberError) setMemberError(null);
                  }}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C3E88D] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1 uppercase tracking-wider text-[10px]">Access Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C3E88D] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none font-mono"
                >
                  <option value="member">Member (View & Investigate)</option>
                  <option value="admin">Admin (Manage Keys & Webhooks)</option>
                  <option value="viewer">Viewer (Read Only)</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-2 border-t border-[#1E2127]">
                <button
                  type="button"
                  onClick={() => {
                    setShowMemberModal(false);
                    setMemberError(null);
                  }}
                  className="px-3 py-1.5 text-xs text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs bg-[#C3E88D] hover:bg-[#d4f2aa] text-[#0A0B0D] font-semibold font-mono rounded cursor-pointer transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Re-Authentication Prompt for Sensitive Operations */}
      {reauthPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReauthPendingDelete(null);
              setReauthPassword('');
              setReauthError(null);
            }
          }}
        >
          <div className="bg-[#101216] border border-[#2A2E37] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2127] pb-3">
              <div className="flex items-center space-x-2 text-[#E6E8EB] font-semibold">
                <Lock className="w-4 h-4 text-[#F07178]" />
                <h3 className="text-sm font-semibold font-mono">Confirm Identity to Delete Project</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReauthPendingDelete(null);
                  setReauthPassword('');
                  setReauthError(null);
                }}
                className="text-[#7B818B] hover:text-[#E6E8EB] p-1 font-mono text-xs cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#9BA1AC] font-mono leading-relaxed">
              Deleting <span className="text-[#E6E8EB] font-semibold">{reauthPendingDelete.name}</span> requires fresh authentication (last sign-in was over 5 minutes ago).
            </p>

            {reauthError && (
              <div className="p-2.5 rounded bg-[#F07178]/10 border border-[#F07178]/30 text-xs font-mono text-[#F07178] flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reauthError}</span>
              </div>
            )}

            {reauthMethod === 'oauth' ? (
              <div className="space-y-3">
                <p className="text-xs text-[#E5C07B] font-mono">
                  Your account uses Google OAuth. Please sign out and sign back in with Google to refresh your session before deleting this project.
                </p>
                <div className="flex justify-end pt-2 border-t border-[#1E2127]">
                  <button
                    type="button"
                    onClick={() => setReauthPendingDelete(null)}
                    className="px-4 py-1.5 text-xs bg-[#16181D] border border-[#2A2E37] text-[#E6E8EB] rounded-full font-mono cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmReauthDelete} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider">
                    Account Password
                  </label>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#F07178] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors font-mono"
                  />
                </div>
                <div className="flex justify-end space-x-2.5 pt-2 border-t border-[#1E2127]">
                  <button
                    type="button"
                    onClick={() => {
                      setReauthPendingDelete(null);
                      setReauthPassword('');
                      setReauthError(null);
                    }}
                    className="px-3 py-1.5 text-xs text-[#7B818B] hover:text-[#E6E8EB] cursor-pointer font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 text-xs bg-[#F07178] hover:bg-[#f48b91] text-[#0A0B0D] font-semibold font-mono rounded-full cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Confirm & Delete'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: SDK Package Download Configuration */}
      <SdkDownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        targetProject={downloadTargetProject || currentProject}
        canManageKeys={canManageKeys}
        initialOption={downloadInitialOption}
        onKeysUpdated={fetchKeys}
      />
    </div>
  );
};

export default ProjectsPage;
