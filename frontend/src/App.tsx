import React from "react";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import  AdminDashboard from "./pages/AdminDashboard";
import  SignupPage from "./pages/SignupPage";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import AccessDenied from "./pages/AccessDenited";

const App = () => {
  return (
    <Router>
      <Header />
      <div className="layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            <Route path="/register" element={<SignupPage />} />

            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }/>
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
