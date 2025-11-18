import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

interface Props {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "dev" | "user")[];
}

const ProtectedRoute = ({ children, allowedRoles }: Props) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/access-denied" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
