import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
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
        <div className="py-6 text-center space-y-2.5">
          <div className="w-6 h-6 mx-auto border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400">Validating cryptographic token...</p>
        </div>
      ) : success ? (
        <div className="p-4 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs space-y-2.5">
          <div className="flex items-center space-x-2 text-emerald-300 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Verification Successful</span>
          </div>
          <p className="text-slate-300 leading-relaxed">{message}</p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors"
            >
              <span>Continue to Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {message && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <p className="text-xs text-slate-400 leading-relaxed">
            If the link in your email did not open automatically, enter your verification token below:
          </p>

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Verification Token</label>
              <input
                type="text"
                required
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste verification token"
                className="w-full bg-[#090d16] border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white transition-colors"
            >
              <span>Verify Token</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="pt-3 border-t border-slate-800/80 text-center">
            <Link to="/login" className="text-xs text-sky-400 hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};
