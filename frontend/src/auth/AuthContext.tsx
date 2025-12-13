import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "@shared/types/user";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);


  useEffect(() => {
    // Carica user + token da localStorage all'avvio
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");
    // controlla che esistano e NON siano "undefined" o "null"
    if (
      storedUser &&
      storedUser !== "undefined" &&
      storedUser !== "null" &&
      storedToken
    ) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser) {
          setUser(parsedUser);
          setToken(storedToken);
        }
      } catch (e) {
        console.error("Errore nel parse di user dal localStorage:", e);
        // in caso di errore pulisco per sicurezza
        localStorage.removeItem("user");
      }
    }
  }, []);

    const login = (u: User, t: string) => {
        try{
            localStorage.setItem("user", JSON.stringify(u));
            localStorage.setItem("token", t);
        }catch(e){
            console.error("Errore nel setting logalStorage:", e);
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
