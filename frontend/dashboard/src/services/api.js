import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-Protection': '1',
  },
});

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Interceptor to attach Double-Submit X-CSRF-Token from api_sec_csrf cookie
api.interceptors.request.use((config) => {
  const csrfToken = getCookie('api_sec_csrf');
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
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
  deleteAccount: (data) => api.delete('/api/auth/account', { data }),
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
  delete: (id, password) => api.delete(`/api/projects/${id}`, { data: password ? { password } : {} }),
  createKey: (projectId, name) => api.post(`/api/projects/${projectId}/keys`, { name }),
  rotateKey: (projectId, keyId, name) => api.post(`/api/projects/${projectId}/keys/${keyId}/rotate`, { name }),
  regenerateKey: (projectId, password) =>
    api.post(`/api/projects/${projectId}/keys/regenerate`, password ? { password } : {}),
  revokeKey: (projectId, keyId) => api.delete(`/api/projects/${projectId}/keys/${keyId}`),
  downloadSdk: async (projectId, payload = {}) => {
    if (!projectId) {
      throw new Error('Project ID is required to download SDK');
    }
    try {
      const response = await api.post(`/api/projects/${projectId}/download-sdk`, payload, {
        responseType: 'blob',
      });
      const disposition = response.headers?.['content-disposition'] || '';
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `mlo11y-sdk-${projectId}.zip`;
      return {
        blob: response.data,
        filename,
        keyMode: response.headers?.['x-sdk-key-mode'] || payload.mode || 'template',
        keyPrefix: response.headers?.['x-sdk-key-prefix'] || 'N/A',
        keyName: response.headers?.['x-sdk-key-name'] || payload.key_name || '',
      };
    } catch (err) {
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          err.response.data = parsed;
        } catch {
          // Keep original blob if response is not JSON
        }
      }
      throw err;
    }
  },
};

export function triggerBlobDownload(blob, filename) {
  if (typeof window === 'undefined' || !blob) return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'mlo11y-sdk.zip';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export const telemetryService = {
  getRecentEvents: (projectId, limit = 50) => api.get(`/events/recent?project_id=${projectId}&limit=${limit}`),
  getAlerts: (projectId, limit = 50) => api.get(`/alerts/recent?project_id=${projectId}&limit=${limit}`),
  getAlertStats: (projectId, window) => api.get(`/alerts/stats?project_id=${projectId}${window ? `&window=${window}` : ''}`),
  getHistory: (projectId, window = '1h') => api.get(`/history?project_id=${projectId}&window=${window}`),
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

export const chainService = {
  getChains: (projectId, params = {}) =>
    api.get('/api/chains', { params: { project_id: projectId, ...params } }),
};

export default api;
