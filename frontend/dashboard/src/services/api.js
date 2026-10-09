import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor for 401 handling without infinite redirect loops
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If unauthenticated on protected routes, caller can handle or redirect
    return Promise.reject(error);
  }
);

export const authService = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  logout: () => api.post('/api/auth/logout'),
  getMe: () => api.get('/api/auth/me'),
  verifyEmail: (token) => api.post('/api/auth/verify-email', { token }),
  resendVerification: (email) => api.post('/api/auth/resend-verification', { email }),
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/api/auth/reset-password', data),
  changePassword: (data) => api.post('/api/auth/change-password', data),
  updateProfile: (data) => api.put('/api/auth/profile', data),
  getGoogleStatus: () => api.get('/api/auth/google/status'),
  getPendingLink: () => api.get('/api/auth/pending-link'),
  linkGoogle: (password) => api.post('/api/auth/link-google', { password }),
};

export const organizationService = {
  list: () => api.get('/api/organizations'),
  create: (data) => api.post('/api/organizations', data),
  get: (id) => api.get(`/api/organizations/${id}`),
  listMembers: (orgId) => api.get(`/api/organizations/${orgId}/members`),
  addMember: (orgId, data) => api.post(`/api/organizations/${orgId}/members`, data),
  removeMember: (orgId, memberId) => api.delete(`/api/organizations/${orgId}/members/${memberId}`),
};

export const projectService = {
  list: (orgId) => api.get(orgId ? `/api/projects?organization_id=${orgId}` : '/api/projects'),
  create: (data) => api.post('/api/projects', data),
  get: (id) => api.get(`/api/projects/${id}`),
  delete: (id) => api.delete(`/api/projects/${id}`),
  createKey: (projectId, name) => api.post(`/api/projects/${projectId}/keys`, { name }),
  regenerateKey: (projectId) => api.post(`/api/projects/${projectId}/keys/regenerate`),
  revokeKey: (projectId, keyId) => api.delete(`/api/projects/${projectId}/keys/${keyId}`),
  downloadSdkUrl: (projectId) => `${API_BASE_URL}/api/projects/${projectId}/download-sdk`,
};

export const telemetryService = {
  getRecentEvents: (projectId, limit = 50) => api.get(`/events/recent?project_id=${projectId}&limit=${limit}`),
  getAlerts: (projectId, limit = 50) => api.get(`/alerts/recent?project_id=${projectId}&limit=${limit}`),
  getAlertStats: (projectId) => api.get(`/alerts/stats?project_id=${projectId}`),
  getHistory: (projectId) => api.get(`/history?project_id=${projectId}`),
  getBlockedIPs: (projectId) => api.get(`/blocked-ips?project_id=${projectId}`),
  blockIP: (data) => api.post('/block-ip', data),
  unblockIP: (data) => api.post('/unblock-ip', data),
};

export const onboardingService = {
  get: (projectId) => api.get(`/api/projects/${projectId}/onboarding`),
  update: (projectId, data) => api.post(`/api/projects/${projectId}/onboarding`, data),
  sendTestEvent: (projectId) => api.post(`/api/projects/${projectId}/onboarding/test-event`),
};

export const webhookService = {
  list: (projectId) => api.get(`/api/projects/${projectId}/webhooks`),
  configure: (projectId, data) => api.post(`/api/projects/${projectId}/webhooks`, data),
  test: (projectId, provider) => api.post(`/api/projects/${projectId}/webhooks/test`, { provider }),
  delete: (projectId, provider) => api.delete(`/api/projects/${projectId}/webhooks/${provider}`),
  toggle: (projectId, provider, enabled) => api.post(`/api/projects/${projectId}/webhooks/toggle`, { provider, enabled }),
  getStatus: (projectId) => api.get(`/api/projects/${projectId}/integrations/status`),
};

export const investigationService = {
  investigate: (alertId) => api.get(`/api/investigate/${alertId}`),
  getReport: (alertId) => api.get(`/api/alerts/${alertId}/report`),
  getPdfUrl: (alertId) => `${API_BASE_URL}/api/alerts/${alertId}/report.pdf?download=1`,
};

export default api;
