import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { authService } from '../../services/api';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await authService.forgotPassword(email);
      setMessage(res.data?.message || 'If an account exists, a password reset link has been dispatched.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit password reset request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Enter your work email to receive a cryptographically signed reset token."
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message ? (
        <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs space-y-3">
          <div className="flex items-center space-x-2 text-emerald-300 font-semibold">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>Check Your Email</span>
          </div>
          <p className="text-slate-300 leading-relaxed">{message}</p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors"
            >
              <span>Return to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Work Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-cyan-600/20"
          >
            <span>{loading ? 'Sending Instructions...' : 'Send Reset Link'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="pt-4 border-t border-slate-800 text-center">
            <Link to="/login" className="text-xs text-cyan-400 hover:underline">
              Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};
