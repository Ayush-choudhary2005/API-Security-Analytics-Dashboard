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
    { label: 'Live Monitoring', to: '/app/live', icon: Activity },
    { label: 'Threats & Alerts', to: '/app/threats', icon: ShieldAlert },
    { label: 'Analytics', to: '/app/analytics', icon: BarChart3 },
    { label: 'Projects & Keys', to: '/app/projects', icon: FolderGit2 },
    { label: 'SDK Onboarding', to: '/app/sdk', icon: Terminal },
    { label: 'Integrations', to: '/app/integrations', icon: Layers },
    { label: 'Investigations', to: '/app/investigations', icon: Search },
    { label: 'Settings', to: '/app/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-black border-b border-zinc-800 h-14 flex items-center justify-between px-4 sm:px-6">
        {/* Left: Mobile Toggle & Brand & Scope Pickers */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-zinc-400 hover:text-white rounded"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <NavLink to="/app" className="flex items-center space-x-2.5 group">
            <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white group-hover:border-zinc-500 transition-colors">
              <Shield className="w-4 h-4" />
            </div>
            <span className="hidden sm:inline-block text-xs font-semibold tracking-tight text-zinc-200 group-hover:text-white transition-colors">
              api-security-analytics-dashboard
            </span>
          </NavLink>

          <div className="hidden lg:block h-4 w-px bg-zinc-800 mx-1" />

          {/* Organization Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setOrgDropdownOpen(!orgDropdownOpen);
                setProjectDropdownOpen(false);
                setUserDropdownOpen(false);
                setNotificationsOpen(false);
              }}
              className="flex items-center space-x-1.5 text-xs font-medium bg-zinc-950 hover:bg-zinc-900 text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-800 transition-colors max-w-[160px] sm:max-w-[200px]"
            >
              <span className="text-zinc-500">Org:</span>
              <span className="truncate">{currentOrg ? currentOrg.name : 'Select Org'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            </button>

            {orgDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl py-1 z-50">
                <div className="px-3 py-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-850">
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
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-zinc-900 ${
                        currentOrg?.id === org.id ? 'text-white bg-zinc-900 font-medium' : 'text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{org.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{org.role || 'member'}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-zinc-800 p-1">
                  <button
                    onClick={() => {
                      setOrgDropdownOpen(false);
                      setShowOrgModal(true);
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 text-xs text-white hover:bg-zinc-900 p-1.5 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
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
              className="flex items-center space-x-1.5 text-xs font-medium bg-zinc-950 hover:bg-zinc-900 text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-800 transition-colors max-w-[160px] sm:max-w-[200px]"
            >
              <span className="text-zinc-500">Project:</span>
              <span className="truncate">{currentProject ? currentProject.name : 'Select Project'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            </button>

            {projectDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl py-1 z-50">
                <div className="px-3 py-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  Projects
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        selectProject(proj);
                        setProjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-zinc-900 ${
                        currentProject?.id === proj.id ? 'text-white bg-zinc-900 font-medium' : 'text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{proj.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{proj.id.slice(0, 8)}</span>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-3 text-xs text-zinc-500 text-center">No projects in organization</div>
                  )}
                </div>
                <div className="border-t border-zinc-800 p-1">
                  <button
                    onClick={() => {
                      setProjectDropdownOpen(false);
                      setShowProjModal(true);
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 text-xs text-white hover:bg-zinc-900 p-1.5 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Project</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Socket Status, Notifications & Profile */}
        <div className="flex items-center space-x-3">
          {/* Real-time Socket Indicator */}
          <div className="hidden sm:flex items-center space-x-2 text-xs px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
            <span
              className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-white' : 'bg-zinc-600'}`}
            />
            <span className="text-[11px] font-medium">{socketConnected ? 'Live' : 'Connecting'}</span>
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
              className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-colors relative"
              aria-label="Security notifications"
            >
              <Bell className="w-4 h-4" />
              {liveAlerts.length > 0 && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white"></span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl py-2 z-50">
                <div className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border-b border-zinc-800 flex items-center justify-between">
                  <span>Security Notifications</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{liveAlerts.length} events</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                  {liveAlerts.length > 0 ? (
                    liveAlerts.map((alt, idx) => (
                      <div key={idx} className="p-3 text-xs hover:bg-zinc-900">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-white uppercase tracking-wider text-[10px]">
                            {alt.attack_type || 'Threat Alert'}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">Recent</span>
                        </div>
                        <p className="text-zinc-300 truncate">{alt.reason || alt.endpoint || 'Anomaly flagged'}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-zinc-500">No new alerts received</div>
                  )}
                </div>
                <div className="border-t border-zinc-800 p-2 text-center">
                  <NavLink
                    to="/app/threats"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs text-zinc-300 hover:text-white hover:underline inline-flex items-center space-x-1"
                  >
                    <span>View all threat alerts</span>
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
              className="flex items-center space-x-1.5 text-xs font-medium text-zinc-300 hover:text-white p-1 rounded hover:bg-zinc-900 transition-colors"
            >
              <div className="w-6 h-6 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center font-semibold text-xs uppercase font-mono">
                {user?.email?.charAt(0) || 'U'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl py-1 z-50">
                <div className="px-3 py-2 border-b border-zinc-800">
                  <p className="text-xs font-semibold text-white truncate">{user?.full_name || 'Operator'}</p>
                  <p className="text-[11px] text-zinc-500 truncate font-mono">{user?.email}</p>
                </div>
                <NavLink
                  to="/app/settings"
                  onClick={() => setUserDropdownOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Account & Settings</span>
                </NavLink>
                <div className="border-t border-zinc-800 my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
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
          className={`hidden md:flex flex-col bg-black border-r border-zinc-800 transition-all duration-150 ${
            sidebarCollapsed ? 'w-14' : 'w-56'
          }`}
        >
          {/* Navigation Items */}
          <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center space-x-2.5 px-2.5 py-2 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-zinc-900 text-white border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>

          {/* Collapse Toggle */}
          <div className="p-2 border-t border-zinc-800">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-900/60 transition-colors"
            >
              <span>{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-64 bg-black border-r border-zinc-800 flex flex-col p-4 z-10">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-white" />
                  <span className="font-semibold text-xs text-white">api-security-analytics-dashboard</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="text-zinc-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 space-y-0.5 overflow-y-auto">
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
                          ? 'bg-zinc-900 text-white border border-zinc-700'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
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
        <main className="flex-1 overflow-y-auto bg-black p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Modal: Create Organization */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">Create New Organization</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Organizations provide complete boundary isolation for projects and SDK telemetry.
            </p>
            <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  placeholder="Acme Corporation"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <div className="flex justify-end space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowOrgModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-white hover:bg-zinc-200 text-black font-semibold rounded transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">Create New Project</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Create a project within <span className="text-white font-medium">{currentOrg?.name}</span> to collect API metrics.
            </p>
            <form onSubmit={handleCreateProjSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="Production API"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Core eCommerce Checkout Service"
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <div className="flex justify-end space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowProjModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs bg-white hover:bg-zinc-200 text-black font-semibold rounded transition-colors"
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
