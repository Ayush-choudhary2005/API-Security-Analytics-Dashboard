import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Activity,
  ShieldAlert,
  BarChart3,
  FolderGit2,
  Terminal,
  Layers,
  Search,
  Settings,
  Menu,
  X,
  Bell,
  ChevronDown,
  Plus,
  LogOut,
  ExternalLink,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { getSocket } from '../services/socket';

export const AppLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const {
    organizations,
    currentOrg,
    selectOrganization,
    projects,
    currentProject,
    selectProject,
    createOrganization,
    createProject,
  } = useProject();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState([]);

  // Modal states
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [showProjModal, setShowProjModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');

  // Socket listener for live connection status & alerts
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      setSocketConnected(socket.connected);

      const onConnect = () => setSocketConnected(true);
      const onDisconnect = () => setSocketConnected(false);
      const onNewAlert = (alert) => {
        setLiveAlerts((prev) => [alert, ...prev.slice(0, 9)]);
      };

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('new_alert', onNewAlert);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('new_alert', onNewAlert);
      };
    }
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleCreateOrgSubmit = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    const res = await createOrganization(newOrgName.trim());
    if (res.success) {
      setShowOrgModal(false);
      setNewOrgName('');
    }
  };

  const handleCreateProjSubmit = async (e) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    const res = await createProject(newProjName.trim(), newProjDesc.trim());
    if (res.success) {
      setShowProjModal(false);
      setNewProjName('');
      setNewProjDesc('');
    }
  };

  const navigationItems = [
    { label: 'Overview', to: '/app', icon: LayoutDashboard },
    { label: 'Live Stream', to: '/app/live', icon: Activity },
    { label: 'Threats & Alerts', to: '/app/threats', icon: ShieldAlert },
    { label: 'Analytics', to: '/app/analytics', icon: BarChart3 },
    { label: 'Projects & Keys', to: '/app/projects', icon: FolderGit2 },
    { label: 'SDK Integration', to: '/app/sdk', icon: Terminal },
    { label: 'Webhooks', to: '/app/integrations', icon: Layers },
    { label: 'AI Investigations', to: '/app/investigations', icon: Search },
    { label: 'Settings', to: '/app/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-[#E6E8EB] flex flex-col font-sans selection:bg-[#2A2E37] selection:text-[#E6E8EB]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#101216]/90 backdrop-blur-md border-b border-[#1E2127] h-14 flex items-center justify-between px-4 sm:px-6">
        {/* Left: Mobile Toggle & Brand & Scope Pickers */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-[#9BA1AC] hover:text-[#E6E8EB] rounded transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <NavLink to="/app" className="flex items-center space-x-2.5 group">
            <div className="w-7 h-7 rounded bg-[#16181D] border border-[#2A2E37] flex items-center justify-center text-[#C792EA] group-hover:border-[#C792EA]/60 transition-colors shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <span className="hidden sm:inline-block text-xs font-semibold tracking-tight text-[#E6E8EB] group-hover:text-white transition-colors">
              API-Security-Analytics-Dashboard
            </span>
          </NavLink>

          <div className="hidden lg:block h-4 w-px bg-[#1E2127] mx-1" />

          {/* Organization Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setOrgDropdownOpen(!orgDropdownOpen);
                setProjectDropdownOpen(false);
                setUserDropdownOpen(false);
                setNotificationsOpen(false);
              }}
              className="flex items-center space-x-1.5 text-xs font-medium bg-[#16181D] hover:bg-[#1E2127] text-[#E6E8EB] px-2.5 py-1.5 rounded border border-[#1E2127] hover:border-[#2A2E37] transition-all max-w-[160px] sm:max-w-[200px]"
            >
              <span className="text-[#7B818B] font-mono text-[11px]">org:</span>
              <span className="truncate">{currentOrg ? currentOrg.name : 'Select Org'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#7B818B] flex-shrink-0" />
            </button>

            {orgDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-[#16181D] border border-[#2A2E37] rounded-md shadow-2xl py-1 z-50">
                <div className="px-3 py-1.5 text-[10px] font-mono font-medium text-[#7B818B] uppercase tracking-wider border-b border-[#1E2127]">
                  Organizations
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        selectOrganization(org);
                        setOrgDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[#1E2127] ${
                        currentOrg?.id === org.id ? 'text-[#C792EA] bg-[#101216] font-semibold' : 'text-[#9BA1AC]'
                      }`}
                    >
                      <span className="truncate">{org.name}</span>
                      <span className="text-[10px] text-[#7B818B] font-mono">{org.role || 'member'}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#1E2127] p-1">
                  <button
                    onClick={() => {
                      setOrgDropdownOpen(false);
                      setShowOrgModal(true);
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 text-xs text-[#E6E8EB] hover:text-white hover:bg-[#1E2127] p-1.5 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#C792EA]" />
                    <span>Create Organization</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Project Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setProjectDropdownOpen(!projectDropdownOpen);
                setOrgDropdownOpen(false);
                setUserDropdownOpen(false);
                setNotificationsOpen(false);
              }}
              className="flex items-center space-x-1.5 text-xs font-medium bg-[#16181D] hover:bg-[#1E2127] text-[#E6E8EB] px-2.5 py-1.5 rounded border border-[#1E2127] hover:border-[#2A2E37] transition-all max-w-[160px] sm:max-w-[200px]"
            >
              <span className="text-[#7B818B] font-mono text-[11px]">proj:</span>
              <span className="truncate">{currentProject ? currentProject.name : 'Select Project'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#7B818B] flex-shrink-0" />
            </button>

            {projectDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-[#16181D] border border-[#2A2E37] rounded-md shadow-2xl py-1 z-50">
                <div className="px-3 py-1.5 text-[10px] font-mono font-medium text-[#7B818B] uppercase tracking-wider border-b border-[#1E2127]">
                  Projects ({currentOrg?.name || 'Active'})
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        selectProject(proj);
                        setProjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[#1E2127] ${
                        currentProject?.id === proj.id ? 'text-[#82AAFF] bg-[#101216] font-semibold' : 'text-[#9BA1AC]'
                      }`}
                    >
                      <span className="truncate">{proj.name}</span>
                      <span className="text-[10px] text-[#7B818B] font-mono">{proj.id.slice(0, 8)}</span>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-3 text-xs text-[#7B818B] text-center">No projects in organization</div>
                  )}
                </div>
                <div className="border-t border-[#1E2127] p-1">
                  <button
                    onClick={() => {
                      setProjectDropdownOpen(false);
                      setShowProjModal(true);
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 text-xs text-[#E6E8EB] hover:text-white hover:bg-[#1E2127] p-1.5 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#82AAFF]" />
                    <span>Create Project</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Socket Status, Notifications & Profile */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {/* Real-time Socket Indicator */}
          <div className="hidden sm:flex items-center space-x-2 text-xs px-2.5 py-1 rounded bg-[#101216] border border-[#1E2127] text-[#9BA1AC]">
            <span
              className={`w-2 h-2 rounded-full ${
                socketConnected ? 'bg-[#C3E88D] shadow-[0_0_8px_rgba(195,232,141,0.6)] animate-pulse' : 'bg-[#7B818B]'
              }`}
            />
            <span className="text-[11px] font-mono">{socketConnected ? 'WS: LIVE' : 'WS: CONNECTING'}</span>
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setUserDropdownOpen(false);
                setOrgDropdownOpen(false);
                setProjectDropdownOpen(false);
              }}
              className="p-1.5 text-[#9BA1AC] hover:text-[#E6E8EB] rounded hover:bg-[#16181D] border border-transparent hover:border-[#1E2127] transition-all relative"
              aria-label="Security notifications"
            >
              <Bell className="w-4 h-4" />
              {liveAlerts.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#F07178] shadow-[0_0_6px_rgba(240,113,120,0.8)]"></span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-[#16181D] border border-[#2A2E37] rounded-md shadow-2xl py-2 z-50">
                <div className="px-3 py-1.5 text-xs font-semibold text-[#E6E8EB] border-b border-[#1E2127] flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#C792EA]">Live Threat Stream</span>
                  <span className="text-[10px] text-[#7B818B] font-mono">{liveAlerts.length} buffered</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[#1E2127]/60">
                  {liveAlerts.length > 0 ? (
                    liveAlerts.map((alt, idx) => (
                      <div key={idx} className="p-3 text-xs hover:bg-[#1E2127] transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-[#F07178] uppercase tracking-wider text-[10px] font-mono">
                            {alt.attack_type || 'ANOMALY'}
                          </span>
                          <span className="text-[10px] text-[#7B818B] font-mono">JUST NOW</span>
                        </div>
                        <p className="text-[#9BA1AC] text-[11px] font-mono truncate">{alt.reason || alt.endpoint || 'Volumetric spike detected'}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-[#7B818B] font-mono">No live threat alerts</div>
                  )}
                </div>
                <div className="border-t border-[#1E2127] p-2 text-center bg-[#101216]">
                  <NavLink
                    to="/app/threats"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs text-[#82AAFF] hover:underline inline-flex items-center space-x-1"
                  >
                    <span>Inspect Threat Registry</span>
                    <ExternalLink className="w-3 h-3" />
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setUserDropdownOpen(!userDropdownOpen);
                setNotificationsOpen(false);
                setOrgDropdownOpen(false);
                setProjectDropdownOpen(false);
              }}
              className="flex items-center space-x-1.5 text-xs font-medium text-[#9BA1AC] hover:text-[#E6E8EB] p-1 rounded hover:bg-[#16181D] border border-transparent hover:border-[#1E2127] transition-all"
            >
              <div className="w-6 h-6 rounded bg-[#16181D] border border-[#2A2E37] text-[#C792EA] flex items-center justify-center font-bold text-xs uppercase font-mono">
                {user?.email?.charAt(0) || 'U'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#7B818B]" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-[#16181D] border border-[#2A2E37] rounded-md shadow-2xl py-1 z-50">
                <div className="px-3 py-2 border-b border-[#1E2127] bg-[#101216]">
                  <p className="text-xs font-semibold text-[#E6E8EB] truncate">{user?.full_name || 'System Operator'}</p>
                  <p className="text-[11px] text-[#7B818B] truncate font-mono">{user?.email}</p>
                </div>
                <NavLink
                  to="/app/settings"
                  onClick={() => setUserDropdownOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] hover:bg-[#1E2127] transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-[#7B818B]" />
                  <span>Account & Keys</span>
                </NavLink>
                <div className="border-t border-[#1E2127] my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-[#F07178] hover:bg-[#1E2127] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Terminate Session</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col bg-[#101216] border-r border-[#1E2127] transition-all duration-150 ${
            sidebarCollapsed ? 'w-14' : 'w-56'
          }`}
        >
          {/* Navigation Items */}
          <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center space-x-2.5 px-2.5 py-2 rounded text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#16181D] text-[#E6E8EB] border-l-2 border-[#C792EA] border-t border-r border-b border-[#2A2E37] shadow-xs'
                      : 'text-[#9BA1AC] hover:text-[#E6E8EB] hover:bg-[#16181D]/60 border border-transparent'
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive ? 'text-[#C792EA]' : 'text-[#7B818B] group-hover:text-[#9BA1AC]'
                    }`}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>

          {/* System Environment Footer Badge */}
          {!sidebarCollapsed && (
            <div className="px-3 py-2 border-t border-[#1E2127] bg-[#0A0B0D]/50 text-[10px] font-mono text-[#7B818B] flex items-center justify-between">
              <span>ACTIVE DEFENSE</span>
              <span className="text-[#C3E88D]">ONLINE</span>
            </div>
          )}

          {/* Collapse Toggle */}
          <div className="p-2 border-t border-[#1E2127]">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center py-1.5 text-[11px] font-mono text-[#7B818B] hover:text-[#E6E8EB] rounded hover:bg-[#16181D] transition-colors"
            >
              <span>{sidebarCollapsed ? '→' : '← COLLAPSE'}</span>
            </button>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-64 bg-[#101216] border-r border-[#1E2127] flex flex-col p-4 z-10">
              <div className="flex items-center justify-between pb-3 border-b border-[#1E2127] mb-3">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-[#C792EA]" />
                  <span className="font-semibold text-xs text-[#E6E8EB]">API-Security-Analytics-Dashboard</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="text-[#9BA1AC] hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.to;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-2.5 px-3 py-2 rounded text-xs font-medium ${
                        isActive
                          ? 'bg-[#16181D] text-[#E6E8EB] border-l-2 border-[#C792EA] border-t border-r border-b border-[#2A2E37]'
                          : 'text-[#9BA1AC] hover:text-[#E6E8EB] hover:bg-[#16181D]/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-[#0A0B0D] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Modal: Create Organization */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#101216] border border-[#2A2E37] rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1">Create New Organization</h3>
            <p className="text-xs text-[#9BA1AC] mb-4">
              Organizations provide boundary isolation for tenant telemetry, alert policies, and access tokens.
            </p>
            <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Organization Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp Infrastructure"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#C792EA] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                />
              </div>
              <div className="flex justify-end space-x-2.5 pt-2 border-t border-[#1E2127]">
                <button
                  type="button"
                  onClick={() => setShowOrgModal(false)}
                  className="px-3 py-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-[#C792EA] hover:bg-[#d6a5f7] text-[#0A0B0D] font-semibold rounded transition-colors"
                >
                  Create Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Project */}
      {showProjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#101216] border border-[#2A2E37] rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-[#E6E8EB] mb-1">Create New Project</h3>
            <p className="text-xs text-[#9BA1AC] mb-4">
              Create an isolated project within <span className="text-[#E6E8EB] font-medium">{currentOrg?.name}</span> to collect API metrics.
            </p>
            <form onSubmit={handleCreateProjSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production API Gateway"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#82AAFF] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#9BA1AC] mb-1.5 uppercase tracking-wider text-[10px]">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Core microservices gateway"
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  className="w-full bg-[#16181D] border border-[#1E2127] focus:border-[#82AAFF] rounded px-3 py-2 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                />
              </div>
              <div className="flex justify-end space-x-2.5 pt-2 border-t border-[#1E2127]">
                <button
                  type="button"
                  onClick={() => setShowProjModal(false)}
                  className="px-3 py-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-[#82AAFF] hover:bg-[#9bbefc] text-[#0A0B0D] font-semibold rounded transition-colors"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLayout;

