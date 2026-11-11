import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { organizationService, projectService } from '../services/api';
import { joinProjectRoom, leaveProjectRoom } from '../services/socket';
import { useAuth } from './AuthContext';

const ProjectContext = createContext(null);

export const ProjectProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load organizations for current user
  const fetchOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setInitialLoading(false);
      return [];
    }
    setLoading(true);
    try {
      const res = await organizationService.list();
      const orgList = res.data?.organizations || [];
      setOrganizations(orgList);

      // Handle current org selection
      if (orgList.length > 0) {
        const savedOrgId = localStorage.getItem('api_sec_current_org_id');
        const matched = orgList.find((o) => o.id === savedOrgId);
        const selected = matched || orgList[0];
        setCurrentOrg(selected);
        localStorage.setItem('api_sec_current_org_id', selected.id);
        return orgList;
      } else {
        setCurrentOrg(null);
        localStorage.removeItem('api_sec_current_org_id');
        setInitialLoading(false);
        return [];
      }
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setError('Failed to load organizations');
      setInitialLoading(false);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Load projects for active organization
  const fetchProjects = useCallback(async (orgId) => {
    if (!orgId) {
      setProjects([]);
      setCurrentProject(null);
      setInitialLoading(false);
      return [];
    }
    setLoading(true);
    try {
      const res = await projectService.list(orgId);
      const projList = res.data?.projects || [];
      setProjects(projList);

      if (projList.length > 0) {
        const savedProjId = localStorage.getItem('api_sec_current_project_id');
        const matched = projList.find((p) => p.id === savedProjId);
        const selected = matched || projList[0];
        setCurrentProject(selected);
        localStorage.setItem('api_sec_current_project_id', selected.id);
        return projList;
      } else {
        setCurrentProject(null);
        localStorage.removeItem('api_sec_current_project_id');
        return [];
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('Failed to load projects');
      return [];
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  // When auth changes, fetch organizations
  useEffect(() => {
    if (isAuthenticated) {
      setInitialLoading(true);
      fetchOrganizations();
    } else {
      setOrganizations([]);
      setCurrentOrg(null);
      setProjects([]);
      setCurrentProject(null);
      setInitialLoading(false);
    }
  }, [isAuthenticated, fetchOrganizations]);

  // When current organization changes, fetch its projects
  useEffect(() => {
    if (currentOrg?.id) {
      fetchProjects(currentOrg.id);
    } else {
      setProjects([]);
      setCurrentProject(null);
    }
  }, [currentOrg, fetchProjects]);

  // Manage WebSocket room for current project
  useEffect(() => {
    if (currentProject?.id) {
      joinProjectRoom(currentProject.id);
      return () => {
        leaveProjectRoom(currentProject.id);
      };
    }
  }, [currentProject?.id]);

  const selectOrganization = (org) => {
    setCurrentOrg(org);
    localStorage.setItem('api_sec_current_org_id', org.id);
  };

  const selectProject = (project) => {
    if (currentProject?.id) {
      leaveProjectRoom(currentProject.id);
    }
    setCurrentProject(project);
    localStorage.setItem('api_sec_current_project_id', project.id);
  };

  // Modal visibility & project-scoped in-memory session keys
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [showCreateProjModal, setShowCreateProjModal] = useState(false);
  const [sessionKeysByProject, setSessionKeysByProject] = useState({});
  const [newlyCreatedModalKey, setNewlyCreatedModalKey] = useState(null);

  const setProjectSessionKey = useCallback((projectId, keyInfo) => {
    if (!projectId || !keyInfo?.rawKey) return;
    const rawKey = keyInfo.rawKey;
    const keyPrefix = keyInfo.keyPrefix || (rawKey.length > 25 ? `${rawKey.slice(0, 25)}...` : rawKey);
    setSessionKeysByProject((prev) => ({
      ...prev,
      [projectId]: {
        rawKey,
        keyName: keyInfo.keyName || 'Session SDK Key',
        keyPrefix,
        createdAt: keyInfo.createdAt || Date.now(),
      },
    }));
  }, []);

  const clearProjectSessionKey = useCallback((projectId) => {
    if (!projectId) return;
    setSessionKeysByProject((prev) => {
      if (!(projectId in prev)) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  }, []);

  const getProjectSessionKey = useCallback(
    (projectId) => (projectId ? sessionKeysByProject[projectId] || null : null),
    [sessionKeysByProject]
  );

  const dismissNewKeyModal = useCallback(() => {
    setNewlyCreatedModalKey(null);
  }, []);

  // Clear all in-memory secret keys whenever user signs out
  useEffect(() => {
    if (!isAuthenticated) {
      setSessionKeysByProject({});
      setNewlyCreatedModalKey(null);
    }
  }, [isAuthenticated]);

  const currentSessionKeyInfo = currentProject?.id ? sessionKeysByProject[currentProject.id] || null : null;
  const latestCreatedKey = currentSessionKeyInfo?.rawKey || null;

  const createOrganization = async (name, slug) => {
    try {
      const res = await organizationService.create({ name, slug });
      await fetchOrganizations();
      if (res.data?.organization) {
        selectOrganization(res.data.organization);
      }
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to create organization' };
    }
  };

  const createProject = async (name, description) => {
    if (!currentOrg?.id) {
      return { success: false, error: 'Select an organization first' };
    }
    try {
      const res = await projectService.create({
        name,
        description,
        organization_id: currentOrg.id,
      });
      const createdProjId = res.data?.project?.id;
      if (res.data?.api_key && createdProjId) {
        setProjectSessionKey(createdProjId, {
          rawKey: res.data.api_key,
          keyName: 'Default SDK Key',
        });
        setNewlyCreatedModalKey({
          projectId: createdProjId,
          rawKey: res.data.api_key,
          keyName: 'Default SDK Key',
        });
      }
      await fetchProjects(currentOrg.id);
      if (res.data?.project) {
        selectProject(res.data.project);
      }
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to create project' };
    }
  };

  const deleteProject = async (projectId) => {
    try {
      await projectService.delete(projectId);
      clearProjectSessionKey(projectId);
      if (newlyCreatedModalKey?.projectId === projectId) {
        setNewlyCreatedModalKey(null);
      }
      if (currentProject?.id === projectId) {
        leaveProjectRoom(projectId);
        setCurrentProject(null);
        localStorage.removeItem('api_sec_current_project_id');
      }
      await fetchProjects(currentOrg?.id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to delete project' };
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        organizations,
        currentOrg,
        projects,
        currentProject,
        loading,
        initialLoading,
        error,
        showCreateOrgModal,
        setShowCreateOrgModal,
        showCreateProjModal,
        setShowCreateProjModal,
        openCreateOrgModal: () => setShowCreateOrgModal(true),
        openCreateProjModal: () => {
          if (!currentOrg || organizations.length === 0) {
            setShowCreateOrgModal(true);
          } else {
            setShowCreateProjModal(true);
          }
        },
        latestCreatedKey,
        currentSessionKeyInfo,
        newlyCreatedModalKey,
        dismissNewKeyModal,
        setProjectSessionKey,
        clearProjectSessionKey,
        getProjectSessionKey,
        setLatestCreatedKey: (rawKey) => {
          if (rawKey && currentProject?.id) {
            setProjectSessionKey(currentProject.id, { rawKey });
          } else if (!rawKey && currentProject?.id) {
            clearProjectSessionKey(currentProject.id);
          }
        },
        selectOrganization,
        selectProject,
        createOrganization,
        createProject,
        deleteProject,
        refreshOrganizations: fetchOrganizations,
        refreshProjects: () => fetchProjects(currentOrg?.id),
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
