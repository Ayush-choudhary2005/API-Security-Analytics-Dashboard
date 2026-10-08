import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Info } from 'lucide-react';
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
      title="Sign in to api-security-analytics-dashboard"
      subtitle="Access your API security analytics console and active defense monitors."
    >
      {linkingNotice && (
        <div className="mb-4 p-2.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs flex items-center space-x-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>{linkingNotice}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-2.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Google Sign In */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors mb-4"
      >
        <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
          <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-[10px]">
          <span className="bg-zinc-950 px-2 text-zinc-500 font-mono uppercase">OR EMAIL</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">Work Email</label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full bg-black border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-zinc-300">Password</label>
            <Link to="/forgot-password" className="text-xs text-zinc-400 hover:text-white transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-black border border-zinc-800 rounded pl-8 pr-9 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-white hover:bg-zinc-200 disabled:opacity-50 text-xs font-semibold text-black transition-colors"
        >
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className="mt-5 pt-4 border-t border-zinc-800 text-center">
        <p className="text-xs text-zinc-400">
          Don't have an account?{' '}
          <Link to="/signup" className="text-white font-medium hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
};
