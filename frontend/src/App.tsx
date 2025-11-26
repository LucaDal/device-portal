import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminDashboard from "./pages/AdminDashboard";
import AccessDenied from "./pages/AccessDenied";
import UsersManagementPage from "./pages/UsersManagementPage";

function LayoutWrapper() {
    const location = useLocation();

    const noSideHeaderPages = ["/login", "/signup"];
    const isAuthPage = noSideHeaderPages.includes(location.pathname);

    return (
        <>
            {!isAuthPage && <Header />}

            <div className={`layout ${isAuthPage ? "layout-auth" : ""}`}>
                {!isAuthPage && <Sidebar />}

                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<HomePage />} />

                        {/* Auth pages */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignupPage />} />
                        <Route path="/access-denied" element={<AccessDenied />} />
                        <Route path="/users" element={<UsersManagementPage/>}/>
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute allowedRoles={["admin"]}>
                                    <AdminDashboard />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </main>
            </div>
        </>
    );
}

const App = () => {
    return (
        <Router>
            <LayoutWrapper />
        </Router>
    );
};

export default App;

