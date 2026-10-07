import React, { useState } from 'react';
import {
  Settings,
  User,
  Lock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Key,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { authService } from '../../services/api';

export const SettingsPage = () => {
  const { user, refreshUser } = useAuth();
  const { currentOrg } = useProject();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState(null);
  const [pwdError, setPwdError] = useState(null);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdSuccess(null);
    setPwdError(null);

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPwdError('Password must be at least 8 characters long');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setPwdSuccess(res.data?.message || 'Password updated successfully. Other sessions invalidated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Account & Security Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your operator profile, credentials, and organization context.
        </p>
      </div>

      {/* Operator Profile */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500/50 text-cyan-400 flex items-center justify-center font-bold text-sm uppercase">
            {user?.email?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{user?.full_name || 'Operator'}</h3>
            <p className="text-xs text-slate-400 font-mono">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-mono">Internal Operator ID</span>
            <p className="font-mono text-cyan-300 mt-0.5">{user?.id || 'usr_unknown'}</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-mono">Email Verification Status</span>
            <p className="flex items-center space-x-1.5 text-emerald-400 font-semibold mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Account</span>
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-mono">Active Workspace</span>
            <p className="text-white font-medium mt-0.5">{currentOrg?.name || 'Default'}</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-mono">Workspace Role</span>
            <p className="font-mono text-cyan-400 uppercase mt-0.5">{currentOrg?.role || 'owner'}</p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-2 text-white font-bold text-sm mb-4">
          <Key className="w-4 h-4 text-cyan-400" />
          <span>Change Password</span>
        </div>

        {pwdSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{pwdSuccess}</span>
          </div>
        )}

        {pwdError && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{pwdError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">New Password (Min. 8 characters)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={pwdLoading}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-cyan-600/20"
          >
            {pwdLoading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
