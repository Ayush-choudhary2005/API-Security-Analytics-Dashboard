import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Shield, Info } from 'lucide-react';
import { AuthLayout } from '../../layouts/AuthLayout';
import { useAuth } from '../../context/AuthContext';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [linkingNotice, setLinkingNotice] = useState(null);

  useEffect(() => {
    const oauthError = searchParams.get('error');
    const linkRequired = searchParams.get('link_required');
    const oauthEmail = searchParams.get('email');

    if (linkRequired === '1' && oauthEmail) {
      setEmail(oauthEmail);
      setLinkingNotice(
        `An account with "${oauthEmail}" already exists. Please sign in with your password to connect your Google account.`
      );
    } else if (oauthError) {
      const errorMap = {
        google_cancelled: 'Google sign-in was cancelled.',
        invalid_oauth_state: 'Invalid or expired OAuth state. Please try again.',
        google_oauth_not_configured: 'Google OAuth is not configured on this server.',
        google_auth_failed: 'Google authentication failed.',
        google_missing_profile: 'Unable to retrieve verified profile from Google.',
        google_already_linked_other: 'This Google account is already linked to another user account.',
        user_not_found: 'Linked account could not be found.',
      };
      setError(errorMap[oauthError] || 'Authentication error occurred.');
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        navigate('/app');
      } else {
        setError(res.error || 'Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <AuthLayout
      title="Sign in to SentinAPI"
      subtitle="Access your API security analytics console and active defense monitors."
    >
      {linkingNotice && (
        <div className="mb-4 p-3 rounded-lg bg-cyan-950/60 border border-cyan-800/80 text-cyan-200 text-xs flex items-center space-x-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>{linkingNotice}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Google Sign In */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center space-x-2.5 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-200 transition-colors shadow-sm mb-5"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-slate-900 px-3 text-slate-500 font-mono">OR EMAIL</span>
        </div>
      </div>

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

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-300">Password</label>
            <Link to="/forgot-password" className="text-xs text-cyan-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-cyan-600/20"
        >
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          Don't have an account?{' '}
          <Link to="/signup" className="text-cyan-400 font-medium hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
};
