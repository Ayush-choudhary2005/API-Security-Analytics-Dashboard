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
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { projectService, organizationService } from '../../services/api';

export const ProjectsPage = () => {
  const { currentOrg, projects, currentProject, selectProject, refreshProjects } = useProject();

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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Project & Credential Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage SDK API keys, organization projects, and team access for {currentOrg?.name}.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'keys' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            SDK API Keys
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'projects' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'members' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Organization Members ({members.length})
          </button>
        </div>
      </div>

      {/* TAB 1: SDK KEYS */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Active SDK Credentials — {currentProject?.name}
                </h3>
                <p className="text-[10px] text-slate-400">
                  CSPRNG 128-bit secret keys. Hashed using SHA-256 in persistence layer.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRegenerateKey}
                  disabled={loading}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/80 text-amber-300 text-xs font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rotate Key</span>
                </button>
                <button
                  onClick={() => {
                    setNewKeyRaw(null);
                    setShowNewKeyModal(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Key</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/80 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Key Name</th>
                    <th className="py-2.5 px-4">Prefix</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Created</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {projectKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 text-white font-sans font-medium">{k.name}</td>
                      <td className="py-2.5 px-4 text-cyan-400">
                        {k.key_prefix}...
                        <button
                          onClick={() => copyToClipboard(k.key_prefix, k.id)}
                          className="ml-2 text-slate-500 hover:text-slate-300 inline-flex align-middle"
                          title="Copy prefix"
                        >
                          {copiedKey === k.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            k.status === 'active'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                          }`}
                        >
                          {k.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                        {k.created_at ? new Date(k.created_at * 1000).toLocaleDateString() : 'Active'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-sans">
                        {k.status === 'active' && (
                          <button
                            onClick={() => handleRevokeKey(k.id)}
                            className="text-xs text-rose-400 hover:text-rose-300 hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {projectKeys.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-500 font-sans">
                        No API keys generated yet. Click 'Create New Key' to provision an SDK credential.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROJECTS LIST */}
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className={`p-5 rounded-xl bg-slate-900 border transition-all ${
                currentProject?.id === proj.id
                  ? 'border-cyan-500/60 shadow-lg shadow-cyan-950/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded">
                  {proj.id.slice(0, 12)}
                </span>
                {currentProject?.id === proj.id && (
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Active</span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mb-1">{proj.name}</h3>
              <p className="text-xs text-slate-400 mb-4 line-clamp-2">{proj.description || 'No description provided'}</p>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <button
                  onClick={() => selectProject(proj)}
                  className={`text-xs font-medium px-3 py-1 rounded transition-colors ${
                    currentProject?.id === proj.id
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {currentProject?.id === proj.id ? 'Selected' : 'Switch To'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: MEMBERS */}
      {activeTab === 'members' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Organization Members</h3>
              <p className="text-[10px] text-slate-400">Team members with workspace access</p>
            </div>
            <button
              onClick={() => setShowMemberModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite Member</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Joined</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {members.map((m) => (
                  <tr key={m.id || m.user_id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-semibold text-white">{m.full_name || 'Team Member'}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{m.email}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-cyan-400">
                        {m.role || 'member'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                      {m.joined_at ? new Date(m.joined_at * 1000).toLocaleDateString() : 'Active'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {m.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id || m.id)}
                          className="text-xs text-rose-400 hover:text-rose-300 hover:underline"
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

      {/* Modal: New Key Created (Raw Key Display - Shown Once) */}
      {showNewKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold mb-2">
              <Key className="w-5 h-5" />
              <span>{newKeyRaw ? 'API Key Generated' : 'Create API Key'}</span>
            </div>

            {newKeyRaw ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Please copy this key now. For your security,{' '}
                  <span className="text-amber-400 font-semibold">it will never be displayed again</span>.
                </p>
                <div className="p-3 rounded-lg bg-slate-950 border border-cyan-800/60 font-mono text-xs text-cyan-300 break-all select-all flex items-center justify-between">
                  <span>{newKeyRaw}</span>
                  <button
                    onClick={() => copyToClipboard(newKeyRaw, 'modal_key')}
                    className="ml-3 p-1 text-slate-400 hover:text-white"
                  >
                    {copiedKey === 'modal_key' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setNewKeyRaw(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white"
                  >
                    I Have Saved This Key
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Key Name</label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production Ingestion Key"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewKeyModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Invite Organization Member</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a teammate to <span className="text-cyan-400 font-semibold">{currentOrg?.name}</span>.
            </p>
            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Teammate Email</label>
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Access Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="member">Member (View & Investigate)</option>
                  <option value="admin">Admin (Manage Keys & Webhooks)</option>
                  <option value="viewer">Viewer (Read Only)</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg"
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
