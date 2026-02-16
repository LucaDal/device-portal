import React from "react";
import { useAuth } from "../auth/AuthContext";
import "../style/HomePage.css";

const HomePage = () => {
  const { user } = useAuth();

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">
          {user ? `Welcome, ${user.email}!` : "Welcome"}
        </h1>
        <p className="home-subtitle">
          Great to see you here ✨
        </p>
      </div>
    </div>
  );
};

export default HomePage;
