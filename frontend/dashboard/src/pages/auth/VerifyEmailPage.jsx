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
          <div className="w-6 h-6 mx-auto border-2 border-[#C792EA] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono text-[#9BA1AC]">Validating cryptographic token...</p>
        </div>
      ) : success ? (
        <div className="p-4 rounded bg-[#16181D] border border-[#1E2127] text-[#E6E8EB] text-xs space-y-3">
          <div className="flex items-center space-x-2 text-[#C3E88D] font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Verification Successful</span>
          </div>
          <p className="text-[#9BA1AC] leading-relaxed">{message}</p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] font-semibold text-xs transition-colors"
            >
              <span>Continue to Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {message && (
            <div className="p-3 rounded bg-[#16181D] border border-[#F07178]/50 text-[#F07178] text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <p className="text-xs text-[#9BA1AC] leading-relaxed">
            If the link in your email did not open automatically, enter your verification token below:
          </p>

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Verification Token</label>
              <input
                type="text"
                required
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste verification token"
                className="w-full bg-[#16181D] border border-[#1E2127] rounded px-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] font-mono focus:outline-none focus:border-[#C792EA] transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-xs font-semibold text-[#0A0B0D] transition-colors shadow-xs"
            >
              <span>Verify Token</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="pt-3 border-t border-[#1E2127] text-center">
            <Link to="/login" className="text-xs text-[#82AAFF] hover:underline transition-colors font-mono text-[11px]">
              Back to Sign In
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};

export default VerifyEmailPage;
