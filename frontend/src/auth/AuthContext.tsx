import React, { createContext, useContext, useState } from "react";
import { User } from "@shared/types/user";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readAuthFromStorage(): { user: User | null; token: string | null } {
  if (typeof window === "undefined") {
    return { user: null, token: null };
  }
  const storedUser = localStorage.getItem("user");
  const storedToken = localStorage.getItem("token");
  if (!storedUser || storedUser === "undefined" || storedUser === "null" || !storedToken) {
    return { user: null, token: null };
  }
  try {
    const parsedUser = JSON.parse(storedUser) as User;
    if (!parsedUser) return { user: null, token: null };
    return { user: parsedUser, token: storedToken };
  } catch {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    return { user: null, token: null };
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [{ user: initialUser, token: initialToken }] = useState(readAuthFromStorage);
  const [user, setUser] = useState<User | null>(initialUser);
  const [token, setToken] = useState<string | null>(initialToken);

    const login = (u: User, t: string) => {
        try{
            localStorage.setItem("user", JSON.stringify(u));
            localStorage.setItem("token", t);
        }catch(e){
            console.error("Error while setting localStorage:", e);
        }
        setUser(u);
        setToken(t);
    };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    setToken(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
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
