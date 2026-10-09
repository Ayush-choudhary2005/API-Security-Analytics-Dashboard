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
        <div className="mb-4 p-3 rounded bg-[#16181D] border border-[#F07178]/50 text-[#F07178] text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message ? (
        <div className="p-4 rounded bg-[#16181D] border border-[#1E2127] text-[#E6E8EB] text-xs space-y-3">
          <div className="flex items-center space-x-2 text-[#C3E88D] font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Check Your Email</span>
          </div>
          <p className="text-[#9BA1AC] leading-relaxed">{message}</p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] font-semibold text-xs transition-colors"
            >
              <span>Return to Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Work Email</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-[#7B818B] absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@company.internal"
                className="w-full bg-[#16181D] border border-[#1E2127] rounded pl-8 pr-3 py-2 text-xs text-[#E6E8EB] placeholder-[#7B818B] focus:outline-none focus:border-[#C792EA] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-[#C792EA] hover:bg-[#d6a5f7] disabled:opacity-50 text-xs font-semibold text-[#0A0B0D] transition-colors shadow-xs"
          >
            <span>{loading ? 'Sending Instructions...' : 'Send Reset Link'}</span>
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

export default ForgotPasswordPage;
