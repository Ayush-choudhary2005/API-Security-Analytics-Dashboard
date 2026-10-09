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
  const [error, setError] = useState(null);

  // Load organizations for current user
  const fetchOrganizations = useCallback(async () => {
    if (!isAuthenticated) return [];
    setLoading(true);
    try {
      const res = await organizationService.list();
      const orgList = res.data?.organizations || [];
      setOrganizations(orgList);

      // Handle current org selection
      if (orgList.length > 0) {
        const savedOrgId = localStorage.getItem('api_sec_current_org_id') || localStorage.getItem('sentinapi_current_org_id');
        const matched = orgList.find((o) => o.id === savedOrgId);
        const selected = matched || orgList[0];
        setCurrentOrg(selected);
        localStorage.setItem('api_sec_current_org_id', selected.id);
        localStorage.removeItem('sentinapi_current_org_id');
        return orgList;
      } else {
        setCurrentOrg(null);
        localStorage.removeItem('api_sec_current_org_id');
        localStorage.removeItem('sentinapi_current_org_id');
        return [];
      }
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setError('Failed to load organizations');
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
      return [];
    }
    setLoading(true);
    try {
      const res = await projectService.list(orgId);
      const projList = res.data?.projects || [];
      setProjects(projList);

      if (projList.length > 0) {
        const savedProjId = localStorage.getItem('api_sec_current_project_id') || localStorage.getItem('sentinapi_current_project_id');
        const matched = projList.find((p) => p.id === savedProjId);
        const selected = matched || projList[0];
        setCurrentProject(selected);
        localStorage.setItem('api_sec_current_project_id', selected.id);
        localStorage.removeItem('sentinapi_current_project_id');
        return projList;
      } else {
        setCurrentProject(null);
        localStorage.removeItem('api_sec_current_project_id');
        localStorage.removeItem('sentinapi_current_project_id');
        return [];
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('Failed to load projects');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // When auth changes, fetch organizations
  useEffect(() => {
    if (isAuthenticated) {
      fetchOrganizations();
    } else {
      setOrganizations([]);
      setCurrentOrg(null);
      setProjects([]);
      setCurrentProject(null);
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
      await fetchProjects(currentOrg.id);
      if (res.data?.project) {
        selectProject(res.data.project);
      }
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to create project' };
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
        error,
        selectOrganization,
        selectProject,
        createOrganization,
        createProject,
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
