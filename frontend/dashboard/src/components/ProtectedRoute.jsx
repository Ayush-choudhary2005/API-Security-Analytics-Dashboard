import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0B0D] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#1E2127] border-t-[#C792EA] rounded-full animate-spin"></div>
        <p className="text-[10px] text-[#9BA1AC] font-mono tracking-wider uppercase">Authenticating session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};
