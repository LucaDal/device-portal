import React from "react";
import { useAuth } from "../auth/AuthContext";
import "../style/HomePage.css";

const HomePage = () => {
  const { user } = useAuth();

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">
          {user ? `Benvenuto, ${user.email}!` : "Benvenuto"}
        </h1>
        <p className="home-subtitle">
          È bello rivederti qui ✨
        </p>
      </div>
    </div>
  );
};

export default HomePage;
