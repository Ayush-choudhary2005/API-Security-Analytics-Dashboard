import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  User,
  Lock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Key,
  BadgeCheck,
  Building,
  Info,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { authService } from '../../services/api';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const { currentOrg } = useProject();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState(null);
  const [pwdError, setPwdError] = useState(null);

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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
        current_password: user?.has_password ? currentPassword : '',
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setPwdSuccess(
        res.data?.message ||
          (user?.has_password
            ? 'Password updated successfully. Other sessions invalidated.'
            : 'Password created successfully! You can now log in using either Google or your email and password.')
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (refreshUser) refreshUser();
    } catch (err) {
      setPwdError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await authService.deleteAccount({
        password: user?.has_password ? deletePassword : '',
        confirmation: !user?.has_password ? deleteConfirmation : '',
      });
      await logout();
      navigate('/login?deleted=1');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#1E2127] pb-4">
        <div className="flex items-center space-x-2.5">
          <h1 className="text-lg font-bold text-[#E6E8EB] tracking-tight">Operator Profile & Security Settings</h1>
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16181D] text-[#82AAFF] border border-[#2A2E37]">
            <span>ACCOUNT_SECURITY</span>
          </span>
        </div>
        <p className="text-xs text-[#9BA1AC] mt-1 font-mono">
          Manage operator authentication credentials, RBAC session parameters, and workspace identity.
        </p>
      </div>

      {/* Operator Profile */}
      <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
        <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-[#1E2127]">
          <div className="w-10 h-10 rounded bg-[#16181D] border border-[#2A2E37] text-[#C792EA] flex items-center justify-center font-bold text-sm font-mono uppercase">
            {user?.email?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E6E8EB]">{user?.full_name || 'Operator'}</h3>
            <p className="text-xs text-[#82AAFF] font-mono">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127]">
            <span className="text-[10px] text-[#7B818B] uppercase font-mono tracking-wider">Internal Operator ID</span>
            <p className="font-mono text-[#E6E8EB] mt-1">{user?.id || 'usr_unknown'}</p>
          </div>

          <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127]">
            <span className="text-[10px] text-[#7B818B] uppercase font-mono tracking-wider">Authentication Status</span>
            <p className="flex items-center space-x-1.5 text-[#C3E88D] font-mono font-medium mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#C3E88D]" />
              <span>Verified Operator</span>
            </p>
          </div>

          <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127]">
            <span className="text-[10px] text-[#7B818B] uppercase font-mono tracking-wider">Active Workspace</span>
            <p className="text-[#E6E8EB] font-medium mt-1">{currentOrg?.name || 'Default'}</p>
          </div>

          <div className="p-3 rounded bg-[#0A0B0D] border border-[#1E2127]">
            <span className="text-[10px] text-[#7B818B] uppercase font-mono tracking-wider">Assigned Role</span>
            <p className="font-mono text-[#C792EA] uppercase mt-1">{currentOrg?.role || 'owner'}</p>
          </div>
        </div>
      </div>

      {/* Change or Set Password */}
      <div className="p-5 rounded bg-[#101216] border border-[#1E2127]">
        <div className="flex items-center space-x-2 text-[#E6E8EB] font-semibold text-xs font-mono uppercase tracking-wider mb-4 border-b border-[#1E2127] pb-3">
          <Key className="w-4 h-4 text-[#C792EA]" />
          <span>{user?.has_password ? 'Credential Rotation' : 'Set Account Password'}</span>
        </div>

        {!user?.has_password && (
          <div className="mb-4 p-3 rounded bg-[#16181D] border border-[#82AAFF]/30 text-[#82AAFF] text-xs font-mono flex items-center space-x-2">
            <Info className="w-4 h-4 flex-shrink-0 text-[#82AAFF]" />
            <span>
              You signed in using Google and do not have a password yet. Set a password below to enable email & password sign-in alongside Google.
            </span>
          </div>
        )}

        {pwdSuccess && (
          <div className="mb-4 p-3 rounded bg-[#101216] border border-[#C3E88D]/40 text-[#C3E88D] text-xs font-mono flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#C3E88D]" />
            <span>{pwdSuccess}</span>
          </div>
        )}

        {pwdError && (
          <div className="mb-4 p-3 rounded bg-[#101216] border border-[#F07178]/40 text-[#F07178] text-xs font-mono flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#F07178]" />
            <span>{pwdError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          {user?.has_password && (
            <div>
              <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">
              {user?.has_password ? 'New Password (Min. 8 characters)' : 'Password (Min. 8 characters)'}
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={pwdLoading}
            className="px-4 py-2 rounded bg-[#C792EA] hover:bg-[#d6a5f5] disabled:opacity-50 text-xs font-semibold font-mono text-[#0A0B0D] transition-colors shadow-xs"
          >
            {pwdLoading
              ? 'SAVING CREDENTIAL...'
              : user?.has_password
              ? 'UPDATE PASSWORD'
              : 'CREATE PASSWORD'}
          </button>
        </form>
      </div>

      {/* Danger Zone: Permanent Account Deletion */}
      <div className="p-5 rounded bg-[#101216] border border-[#F07178]/30">
        <div className="flex items-center space-x-2 text-[#F07178] font-semibold text-xs font-mono uppercase tracking-wider mb-2">
          <AlertTriangle className="w-4 h-4 text-[#F07178]" />
          <span>Danger Zone: Account Deletion</span>
        </div>
        <p className="text-xs text-[#9BA1AC] font-mono mb-4">
          Permanently delete your operator profile, workspace ownership, registered projects, SDK keys, and all telemetry events. This action is irreversible.
        </p>

        {deleteError && (
          <div className="mb-4 p-3 rounded bg-[#101216] border border-[#F07178]/40 text-[#F07178] text-xs font-mono flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#F07178]" />
            <span>{deleteError}</span>
          </div>
        )}

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded bg-[#16181D] hover:bg-[#F07178]/10 text-[#F07178] border border-[#F07178]/40 text-xs font-semibold font-mono transition-colors flex items-center space-x-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#F07178]" />
            <span>PERMANENTLY DELETE ACCOUNT</span>
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="space-y-4 max-w-md p-4 rounded bg-[#0A0B0D] border border-[#F07178]/40">
            <div className="text-xs font-mono text-[#E6E8EB] font-medium">
              {user?.has_password
                ? 'Please enter your password to confirm permanent account deletion:'
                : 'Type DELETE to confirm permanent account deletion:'}
            </div>

            {user?.has_password ? (
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">
                  Confirm Your Password
                </label>
                <input
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#F07178] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">
                  Confirmation Phrase
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#F07178] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                />
              </div>
            )}

            <div className="flex items-center space-x-3 pt-1">
              <button
                type="submit"
                disabled={deleteLoading || (!user?.has_password && deleteConfirmation.trim().toUpperCase() !== 'DELETE')}
                className="px-4 py-2 rounded bg-[#F07178] hover:bg-[#e0565f] disabled:opacity-50 text-xs font-semibold font-mono text-[#0A0B0D] transition-colors shadow-xs cursor-pointer"
              >
                {deleteLoading ? 'DELETING ACCOUNT...' : 'CONFIRM PERMANENT DELETION'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setDeleteConfirmation('');
                  setDeleteError(null);
                }}
                className="px-3 py-2 rounded bg-[#16181D] hover:bg-[#1E2127] text-[#9BA1AC] text-xs font-mono transition-colors border border-[#1E2127] cursor-pointer"
              >
                CANCEL
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
