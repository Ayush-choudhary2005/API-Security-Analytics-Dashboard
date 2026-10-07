import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';

// Lazy-loaded Public Pages
const LandingPage = lazy(() =>
  import('./pages/public/LandingPage').then((m) => ({ default: m.LandingPage }))
);

// Lazy-loaded Auth Pages
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() =>
  import('./pages/auth/SignupPage').then((m) => ({ default: m.SignupPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);
const VerifyEmailPage = lazy(() =>
  import('./pages/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
);

// Lazy-loaded Dashboard Pages
const OverviewPage = lazy(() =>
  import('./pages/dashboard/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const LiveMonitoringPage = lazy(() =>
  import('./pages/dashboard/LiveMonitoringPage').then((m) => ({ default: m.LiveMonitoringPage }))
);
const ThreatsPage = lazy(() =>
  import('./pages/dashboard/ThreatsPage').then((m) => ({ default: m.ThreatsPage }))
);
const AnalyticsPage = lazy(() =>
  import('./pages/dashboard/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const ProjectsPage = lazy(() =>
  import('./pages/dashboard/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);
const SdkOnboardingPage = lazy(() =>
  import('./pages/dashboard/SdkOnboardingPage').then((m) => ({ default: m.SdkOnboardingPage }))
);
const IntegrationsPage = lazy(() =>
  import('./pages/dashboard/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage }))
);
const InvestigationsPage = lazy(() =>
  import('./pages/dashboard/InvestigationsPage').then((m) => ({ default: m.InvestigationsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/dashboard/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

const PageLoader = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
    <span className="text-xs font-mono text-slate-400">Loading module...</span>
  </div>
);

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProjectProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Visitor Experience */}
              <Route path="/" element={<LandingPage />} />

              {/* Authentication Flow */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />

              {/* Authenticated Dashboard Application */}
              <Route
                path="/app/*"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          <Route index element={<OverviewPage />} />
                          <Route path="live" element={<LiveMonitoringPage />} />
                          <Route path="threats" element={<ThreatsPage />} />
                          <Route path="analytics" element={<AnalyticsPage />} />
                          <Route path="projects" element={<ProjectsPage />} />
                          <Route path="sdk" element={<SdkOnboardingPage />} />
                          <Route path="integrations" element={<IntegrationsPage />} />
                          <Route path="investigations" element={<InvestigationsPage />} />
                          <Route path="settings" element={<SettingsPage />} />
                          <Route path="*" element={<Navigate to="/app" replace />} />
                        </Routes>
                      </Suspense>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ProjectProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
