import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@shared/types/user";
import { loadCurrentUser, logout as apiLogout } from "./authService";
import { navigateTo } from "../utils/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readAuthFromStorage(): { user: User | null } {
  if (typeof window === "undefined") {
    return { user: null };
  }
  const storedUser = localStorage.getItem("user");
  if (!storedUser || storedUser === "undefined" || storedUser === "null") {
    return { user: null };
  }
  try {
    const parsedUser = JSON.parse(storedUser) as User;
    if (!parsedUser) return { user: null };
    return { user: parsedUser };
  } catch {
    localStorage.removeItem("user");
    return { user: null };
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [{ user: initialUser }] = useState(readAuthFromStorage);
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function syncUserFromSession() {
      try {
        const ret = await loadCurrentUser();
        if (cancelled) return;
        localStorage.setItem("user", JSON.stringify(ret.user));
        setUser(ret.user);
      } catch {
        if (cancelled) return;
        localStorage.removeItem("user");
        setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void syncUserFromSession();
    return () => {
      cancelled = true;
    };
  }, []);

    const login = (u: User) => {
        try{
            localStorage.setItem("user", JSON.stringify(u));
        }catch(e){
            console.error("Error while setting localStorage:", e);
        }
        setUser(u);
    };

  const logout = () => {
    void apiLogout().catch(() => undefined).finally(() => {
      localStorage.removeItem("user");
      setUser(null);
      navigateTo("/login");
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook personalizzato per usare AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
