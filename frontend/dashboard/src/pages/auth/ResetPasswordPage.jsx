import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { authService } from '../../services/api';

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();

  const tokenParam = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenParam);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (!token.trim()) {
      setError('Reset token is required');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.resetPassword({
        token: token.trim(),
        password,
        confirm_password: confirmPassword,
      });
      setMessage(res.data?.message || 'Password updated successfully. All other sessions have been invalidated.');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired password reset token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set New Password"
      subtitle="Enter your single-use reset token and choose a strong replacement password."
    >
      {error && (
        <div className="mb-4 p-3 rounded bg-[#16181D] border border-[#F07178]/50 text-[#F07178] text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message ? (
        <div className="p-4 rounded bg-[#16181D] border border-[#1E2127] text-[#E6E8EB] text-xs space-y-3">
          <div className="flex items-center space-x-2 text-[#C3E88D] font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Password Reset Complete</span>
          </div>
          <p className="text-[#9BA1AC] leading-relaxed">{message}</p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] font-semibold text-xs transition-colors"
            >
              <span>Sign In with New Password</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Reset Token</label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste security reset token"
              className="w-full bg-[#16181D] border border-[#1E2127] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] font-mono focus:outline-none focus:border-[#C792EA] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">New Password (Min. 8 chars)</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#7B818B] absolute left-3 top-2.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#16181D] border border-[#1E2127] rounded pl-8 pr-9 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none focus:border-[#C792EA] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-[#7B818B] hover:text-[#E6E8EB]"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Confirm New Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#7B818B] absolute left-3 top-2.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#16181D] border border-[#1E2127] rounded pl-8 pr-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none focus:border-[#C792EA] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-[#C792EA] hover:bg-[#d6a5f7] disabled:opacity-50 text-xs font-semibold text-[#0A0B0D] transition-colors shadow-xs"
          >
            <span>{loading ? 'Updating Password...' : 'Save New Password'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <div className="pt-3 border-t border-[#1E2127] text-center">
            <Link to="/login" className="text-xs text-[#82AAFF] hover:underline transition-colors font-mono text-[11px]">
              Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPasswordPage;
