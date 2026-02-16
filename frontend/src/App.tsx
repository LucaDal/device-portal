import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import AccessDenied from "./pages/AccessDenied";
import UsersManagementPage from "./pages/UsersManagementPage";
import DeviceTypesPage from "./pages/DeviceTypesPage";
import DevicesPage from "./pages/DevicePage";
import AddDevicePage from "./pages/AddDevicePage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import SettingsPage from "./pages/SettingsPage";
import { ROLES } from "@shared/constants/auth";

function LayoutWrapper() {
    const location = useLocation();

    const noSideHeaderPages = ["/login", "/change-password"];
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
                        <Route
                            path="/change-password"
                            element={
                                <ProtectedRoute>
                                    <ChangePasswordPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="/access-denied" element={<AccessDenied />} />
                        <Route
                            path="/users"
                            element={
                                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                                    <UsersManagementPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/devices"
                            element={
                                <ProtectedRoute>
                                    <DevicesPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/add-device"
                            element={
                                <ProtectedRoute>
                                    <AddDevicePage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/settings"
                            element={
                                <ProtectedRoute>
                                    <SettingsPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="/device-types" element={
                                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                                    <DeviceTypesPage />
                                </ProtectedRoute>
                                }/>
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
