import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style/index.css";
import { AuthProvider } from "./auth/AuthContext";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
  );
} else {
  console.error("Root element non trovato!");
}
