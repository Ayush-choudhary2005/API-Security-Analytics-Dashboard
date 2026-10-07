import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { authService } from '../../services/api';

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(!!token);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const [manualToken, setManualToken] = useState(token);

  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token]);

  const verifyToken = async (tok) => {
    setLoading(true);
    try {
      const res = await authService.verifyEmail(tok);
      setSuccess(true);
      setMessage(res.data?.message || 'Email verified successfully.');
    } catch (err) {
      setSuccess(false);
      setMessage(err.response?.data?.error || 'Invalid or expired verification token');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualToken.trim()) {
      verifyToken(manualToken.trim());
    }
  };

  return (
    <AuthLayout
      title="Verify Email Address"
      subtitle="Confirming your single-use cryptographic token."
    >
      {loading ? (
        <div className="py-8 text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400">Validating cryptographic token...</p>
        </div>
      ) : success ? (
        <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs space-y-3">
          <div className="flex items-center space-x-2 text-emerald-300 font-semibold">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>Verification Successful</span>
          </div>
          <p className="text-slate-300 leading-relaxed">{message}</p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors"
            >
              <span>Continue to Login</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {message && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Enter Verification Token</label>
              <input
                type="text"
                required
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste token from verification email"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-all shadow-md shadow-cyan-600/20"
            >
              <span>Confirm Token</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-center">
            <Link to="/login" className="text-xs text-cyan-400 hover:underline">
              Return to Login
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};
