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
          <h1 className="text-lg font-semibold text-white tracking-tight">Project & Credential Management</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage SDK API keys, organization projects, and team access for {currentOrg?.name}.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="inline-flex items-center space-x-1 bg-[#070a10] border border-slate-800 p-0.5 rounded-md self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'keys' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SDK API Keys
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'projects' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'members' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Organization Members ({members.length})
          </button>
        </div>
      </div>

      {/* TAB 1: SDK KEYS */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          <div className="rounded-md bg-[#0e1420] border border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Active SDK Credentials: {currentProject?.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  CSPRNG 128-bit secret keys. Hashed using SHA-256 in persistence layer.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRegenerateKey}
                  disabled={loading}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rotate Key</span>
                </button>
                <button
                  onClick={() => {
                    setNewKeyRaw(null);
                    setShowNewKeyModal(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Key</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0a0e17] text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Key Name</th>
                    <th className="py-2.5 px-4">Prefix</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Created</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-[#0e1420]">
                  {projectKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 text-white font-sans font-medium">{k.name}</td>
                      <td className="py-2.5 px-4 text-sky-400">
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
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                            k.status === 'active'
                              ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                              : 'bg-rose-950/70 text-rose-400 border border-rose-800/50'
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
              className={`p-5 rounded-md bg-[#0e1420] border transition-colors ${
                currentProject?.id === proj.id
                  ? 'border-sky-500/60 shadow-sm'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-sky-400 bg-sky-950/50 border border-sky-800/40 px-1.5 py-0.5 rounded">
                  {proj.id.slice(0, 12)}
                </span>
                {currentProject?.id === proj.id && (
                  <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Active</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{proj.name}</h3>
              <p className="text-xs text-slate-400 mb-4 line-clamp-2">{proj.description || 'No description provided'}</p>

              <div className="pt-3 border-t border-slate-800/70 flex items-center justify-between">
                <button
                  onClick={() => selectProject(proj)}
                  className={`text-xs font-medium px-3 py-1 rounded transition-colors ${
                    currentProject?.id === proj.id
                      ? 'bg-sky-600 text-white'
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
        <div className="rounded-md bg-[#0e1420] border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Organization Members</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Team members with workspace access</p>
            </div>
            <button
              onClick={() => setShowMemberModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite Member</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0a0e17] text-slate-400 font-mono text-[10px] uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Joined</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-[#0e1420]">
                {members.map((m) => (
                  <tr key={m.id || m.user_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-white">{m.full_name || 'Team Member'}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{m.email}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-sky-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#0e1420] border border-slate-800 rounded-md p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold mb-2">
              <Key className="w-5 h-5" />
              <span>{newKeyRaw ? 'API Key Generated' : 'Create API Key'}</span>
            </div>

            {newKeyRaw ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Please copy this key now. For your security,{' '}
                  <span className="text-amber-400 font-medium">it will never be displayed again</span>.
                </p>
                <div className="p-3 rounded bg-[#070a10] border border-sky-800/50 font-mono text-xs text-sky-300 break-all select-all flex items-center justify-between">
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
                    className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white shadow-sm"
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
                    className="w-full bg-[#070a10] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
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
                    className="px-4 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white font-medium rounded shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#0e1420] border border-slate-800 rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">Invite Organization Member</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a teammate to <span className="text-sky-400 font-medium">{currentOrg?.name}</span>.
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
                  className="w-full bg-[#070a10] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Access Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full bg-[#070a10] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
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
                  className="px-4 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white font-medium rounded shadow-sm"
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
