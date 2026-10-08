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
        <h1 className="text-lg font-semibold text-white tracking-tight">Account & Security Settings</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Manage your operator profile, credentials, and organization context.
        </p>
      </div>

      {/* Operator Profile */}
      <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
        <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-zinc-800">
          <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-700 text-white flex items-center justify-center font-semibold text-xs font-mono uppercase">
            {user?.email?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{user?.full_name || 'Operator'}</h3>
            <p className="text-xs text-zinc-400 font-mono">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded bg-black border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Internal Operator ID</span>
            <p className="font-mono text-zinc-200 mt-0.5">{user?.id || 'usr_unknown'}</p>
          </div>

          <div className="p-3 rounded bg-black border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Email Verification Status</span>
            <p className="flex items-center space-x-1.5 text-white font-medium mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              <span>Verified Account</span>
            </p>
          </div>

          <div className="p-3 rounded bg-black border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Active Workspace</span>
            <p className="text-white font-medium mt-0.5">{currentOrg?.name || 'Default'}</p>
          </div>

          <div className="p-3 rounded bg-black border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Workspace Role</span>
            <p className="font-mono text-white uppercase mt-0.5">{currentOrg?.role || 'owner'}</p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="p-5 rounded bg-zinc-950 border border-zinc-800">
        <div className="flex items-center space-x-2 text-white font-semibold text-sm mb-4">
          <Key className="w-4 h-4 text-white" />
          <span>Change Password</span>
        </div>

        {pwdSuccess && (
          <div className="mb-4 p-3 rounded bg-zinc-900 border border-zinc-700 text-white text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-white" />
            <span>{pwdSuccess}</span>
          </div>
        )}

        {pwdError && (
          <div className="mb-4 p-3 rounded bg-zinc-950 border border-zinc-700 text-zinc-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-zinc-400" />
            <span>{pwdError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">New Password (Min. 8 characters)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
            />
          </div>

          <button
            type="submit"
            disabled={pwdLoading}
            className="px-4 py-2 rounded bg-white hover:bg-zinc-200 disabled:opacity-50 text-xs font-semibold text-black transition-colors shadow-sm"
          >
            {pwdLoading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
