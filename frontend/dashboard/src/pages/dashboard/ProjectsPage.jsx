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
  Shield,
  UserPlus,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { projectService, organizationService } from '../../services/api';

export const ProjectsPage = () => {
  const {
    currentOrg,
    organizations,
    projects,
    currentProject,
    selectProject,
    refreshProjects,
    openCreateOrgModal,
    openCreateProjModal,
    deleteProject,
  } = useProject();

  const [activeTab, setActiveTab] = useState('keys'); // 'keys', 'projects', 'members'
  const [projectKeys, setProjectKeys] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // New Key modal
  const [newKeyRaw, setNewKeyRaw] = useState(null);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('Developer Key');

  // Member invite modal
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');

  const fetchKeys = useCallback(async () => {
    if (!currentProject?.id) return;
    try {
      const res = await projectService.get(currentProject.id);
      setProjectKeys(res.data?.api_keys || []);
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
    try {
      const res = await projectService.createKey(currentProject.id, newKeyName);
      if (res.data?.raw_key) {
        setNewKeyRaw(res.data.raw_key);
      }
      fetchKeys();
    } catch (err) {
      console.error('Failed to generate key:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!currentProject?.id) return;
    if (!window.confirm('Are you sure you want to rotate this project key? The current key will be revoked immediately.')) {
      return;
    }
    setLoading(true);
    try {
      const res = await projectService.regenerateKey(currentProject.id);
      if (res.data?.key?.raw_key) {
        setNewKeyRaw(res.data.key.raw_key);
        setShowNewKeyModal(true);
      }
      fetchKeys();
    } catch (err) {
      console.error('Failed to rotate key:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!currentProject?.id) return;
    if (!window.confirm('Revoking this key will immediately reject all SDK telemetry using it. Proceed?')) {
      return;
    }
    try {
      await projectService.revokeKey(currentProject.id, keyId);
      fetchKeys();
    } catch (err) {
      console.error('Failed to revoke key:', err);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Are you sure you want to delete project "${projectName}"? All API keys and telemetry for this project will be deleted.`)) {
      return;
    }
    const res = await deleteProject(projectId);
    if (!res.success) {
      alert(res.error || 'Failed to delete project');
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id || !memberEmail.trim()) return;
    setLoading(true);
    try {
      await organizationService.addMember(currentOrg.id, {
        email: memberEmail.trim(),
        role: memberRole,
      });
      setShowMemberModal(false);
      setMemberEmail('');
      fetchMembers();
    } catch (err) {
      console.error('Failed to invite member:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!currentOrg?.id) return;
    if (!window.confirm('Remove this member from the organization?')) return;
    try {
      await organizationService.removeMember(currentOrg.id, memberId);
      fetchMembers();
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  // Empty state: No workspace
  if (!currentOrg || organizations.length === 0) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#101216] border border-[#1E2127] rounded-md p-8 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-[#C792EA]/10 border border-[#C792EA]/30 flex items-center justify-center mx-auto text-[#C792EA]">
          <FolderGit2 className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-[#E6E8EB]">No Workspace Created</h2>
        <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed">
          Create an organization workspace before provisioning projects and API keys.
        </p>
        <div className="pt-2">
          <button
            onClick={openCreateOrgModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-xs text-[#0A0B0D] font-semibold transition-colors shadow-xs"
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
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#C792EA] border border-[#2A2E37]">
              <span>ORG_WORKSPACE</span>
            </span>
          </div>
          <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
            Provision SDK authentication tokens, switch projects, and grant RBAC access in {currentOrg?.name || 'Active Workspace'}.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="inline-flex items-center space-x-1 bg-[#101216] border border-[#1E2127] p-1 rounded self-start sm:self-auto font-mono text-xs">
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'keys'
                ? 'bg-[#16181D] text-[#C792EA] font-semibold border border-[#2A2E37]'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            SDK API Keys
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'projects'
                ? 'bg-[#16181D] text-[#82AAFF] font-semibold border border-[#2A2E37]'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'members'
                ? 'bg-[#16181D] text-[#C3E88D] font-semibold border border-[#2A2E37]'
                : 'text-[#7B818B] hover:text-[#E6E8EB]'
            }`}
          >
            Members ({members.length})
          </button>
        </div>
      </div>

      {/* TAB 1: SDK KEYS */}
      {activeTab === 'keys' && (
        !currentProject ? (
          <div className="py-16 text-center space-y-3 bg-[#101216] border border-[#1E2127] rounded p-6">
            <Key className="w-8 h-8 text-[#7B818B] mx-auto opacity-60" />
            <h3 className="text-sm font-semibold text-[#E6E8EB]">No Project Selected</h3>
            <p className="text-xs text-[#9BA1AC] max-w-sm mx-auto">
              Select or create a project to inspect and generate SDK API keys.
            </p>
            <div className="pt-2">
              {projects.length > 0 ? (
                <button
                  onClick={() => setActiveTab('projects')}
                  className="px-3.5 py-1.5 bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold rounded font-mono transition-colors"
                >
                  Choose a Project
                </button>
              ) : (
                <button
                  onClick={openCreateProjModal}
                  className="px-3.5 py-1.5 bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold rounded font-mono transition-colors"
                >
                  Create Project
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded bg-[#101216] border border-[#1E2127] p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-[#1E2127] pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <Key className="w-4 h-4 text-[#C792EA]" />
                    <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">
                      SDK Credentials: {currentProject?.name}
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#9BA1AC] font-mono mt-1">
                    CSPRNG 128-bit secret keys. Cryptographically hashed using SHA-256 in persistence layer.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRegenerateKey}
                    disabled={loading}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1E2127] border border-[#1E2127] text-[#9BA1AC] hover:text-[#E6E8EB] text-xs font-mono transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Rotate Key</span>
                  </button>
                  <button
                    onClick={() => {
                      setNewKeyRaw(null);
                      setShowNewKeyModal(true);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Key</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-[#1E2127]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#16181D] text-[#7B818B] text-[10px] uppercase tracking-wider border-b border-[#1E2127]">
                    <tr>
                      <th className="py-2.5 px-4">Key Label</th>
                      <th className="py-2.5 px-4">Secret Prefix</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Provisioned</th>
                      <th className="py-2.5 px-4 text-right">Enforcement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2127]/60 bg-[#101216]">
                    {projectKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-[#16181D]/60 transition-colors">
                        <td className="py-2.5 px-4 text-[#E6E8EB] font-sans font-medium">{k.name}</td>
                        <td className="py-2.5 px-4 text-[#82AAFF]">
                          {k.key_prefix}...
                          <button
                            onClick={() => copyToClipboard(k.key_prefix, k.id)}
                            className="ml-2 text-[#7B818B] hover:text-[#E6E8EB] inline-flex align-middle"
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
                        <td className="py-2.5 px-4 text-[#7B818B] text-[11px]">
                          {k.created_at ? new Date(k.created_at * 1000).toLocaleDateString() : 'Active'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-sans">
                          {k.status === 'active' && (
                            <button
                              onClick={() => handleRevokeKey(k.id)}
                              className="text-xs text-[#F07178] hover:underline font-mono"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {projectKeys.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-8 text-center text-[#7B818B] font-mono">
                          Zero API keys generated yet. Click 'Create New Key' to provision an ingestion credential.
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
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs"
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
                  className="px-3.5 py-1.5 bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] text-xs font-semibold rounded font-mono transition-colors"
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
                  className={`p-5 rounded bg-[#101216] border transition-colors ${
                    currentProject?.id === proj.id
                      ? 'border-[#82AAFF] bg-[#16181D]'
                      : 'border-[#1E2127] hover:border-[#2A2E37]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-[#82AAFF] bg-[#16181D] border border-[#2A2E37] px-1.5 py-0.5 rounded">
                      {proj.id.slice(0, 12)}
                    </span>
                    {currentProject?.id === proj.id && (
                      <span className="text-[10px] font-mono text-[#C3E88D] uppercase tracking-wider font-semibold border border-[#C3E88D]/30 px-1.5 py-0.5 rounded bg-[#C3E88D]/10">ACTIVE PROJECT</span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1">{proj.name}</h3>
                  <p className="text-xs text-[#9BA1AC] mb-4 line-clamp-2">{proj.description || 'No description provided'}</p>

                  <div className="pt-3 border-t border-[#1E2127] flex items-center justify-between">
                    <button
                      onClick={() => selectProject(proj)}
                      className={`text-xs font-mono font-semibold px-3 py-1 rounded transition-colors ${
                        currentProject?.id === proj.id
                          ? 'bg-[#82AAFF] text-[#0A0B0D]'
                          : 'bg-[#16181D] text-[#9BA1AC] hover:text-[#E6E8EB] border border-[#1E2127]'
                      }`}
                    >
                      {currentProject?.id === proj.id ? 'Selected' : 'Switch Context'}
                    </button>
                    <button
                      onClick={() => handleDeleteProject(proj.id, proj.name)}
                      className="text-xs text-[#F07178] hover:text-red-400 font-mono transition-colors"
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
        <div className="rounded bg-[#101216] border border-[#1E2127] p-5">
          <div className="flex items-center justify-between mb-4 border-b border-[#1E2127] pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-[#C3E88D]" />
                <h3 className="text-xs font-mono font-semibold text-[#E6E8EB] uppercase tracking-wider">Organization Members</h3>
              </div>
              <p className="text-[11px] text-[#9BA1AC] font-mono mt-0.5">Team members with workspace access privileges</p>
            </div>
            <button
              onClick={() => setShowMemberModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#C3E88D] hover:bg-[#d4f2aa] text-[#0A0B0D] text-xs font-semibold font-mono transition-colors shadow-xs"
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
                          className="text-xs text-[#F07178] hover:underline"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#101216] border border-[#2A2E37] rounded p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center space-x-2 text-[#E6E8EB] font-semibold mb-2">
              <Key className="w-5 h-5 text-[#C792EA]" />
              <span className="font-mono text-sm">{newKeyRaw ? 'API Key Generated' : 'Create API Key'}</span>
            </div>

            {newKeyRaw ? (
              <div className="space-y-4">
                <p className="text-xs text-[#9BA1AC] leading-relaxed font-mono">
                  Copy this key immediately. For your security,{' '}
                  <span className="text-[#F07178] font-bold">it will never be displayed again</span>.
                </p>
                <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127] font-mono text-xs text-[#82AAFF] break-all select-all flex items-center justify-between">
                  <span>{newKeyRaw}</span>
                  <button
                    onClick={() => copyToClipboard(newKeyRaw, 'modal_key')}
                    className="ml-3 p-1 text-[#7B818B] hover:text-[#E6E8EB]"
                  >
                    {copiedKey === 'modal_key' ? <Check className="w-4 h-4 text-[#C3E88D]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setNewKeyRaw(null);
                    }}
                    className="px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f5] text-xs font-semibold text-[#0A0B0D] font-mono"
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
                    className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2 border-t border-[#1E2127]">
                  <button
                    type="button"
                    onClick={() => setShowNewKeyModal(false)}
                    className="px-3 py-1.5 text-xs text-[#7B818B] hover:text-[#E6E8EB]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 text-xs bg-[#C792EA] hover:bg-[#d6a5f5] text-[#0A0B0D] font-semibold font-mono rounded"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#101216] border border-[#2A2E37] rounded p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1 font-mono">Invite Organization Member</h3>
            <p className="text-xs text-[#9BA1AC] mb-4">
              Add a teammate to <span className="text-[#82AAFF] font-medium">{currentOrg?.name}</span>.
            </p>
            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1 uppercase tracking-wider text-[10px]">Teammate Email</label>
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
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
                  onClick={() => setShowMemberModal(false)}
                  className="px-3 py-1.5 text-xs text-[#7B818B] hover:text-[#E6E8EB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs bg-[#C3E88D] hover:bg-[#d4f2aa] text-[#0A0B0D] font-semibold font-mono rounded"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
