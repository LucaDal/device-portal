import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DeviceWithRelations } from "@shared/types/device";
import DeviceAvailability from "../devices/DeviceAvailability";
import DashboardWidgets from "../widgets/DashboardWidgets";
import { useMqttStream } from "../widgets/useMqttStream";
import { useAuth } from "../auth/AuthContext";
import { getDevices } from "../devices/deviceService";
import ErrorBanner from "../components/ErrorBanner";
import "../style/HomePage.css";

const HomePage = () => {
    const { user, loading: authLoading } = useAuth();
    const [devices, setDevices] = useState<DeviceWithRelations[]>([]);
    const [selectedDeviceCode, setSelectedDeviceCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasMqttDevices = devices.some((device) => Boolean(device.mqtt_available));
    const stream = useMqttStream(user?.id, hasMqttDevices);

    const fetchDevices = async () => {
        if (!user) return;
        try {
            setLoading(true);
            setError(null);
            const rows = await getDevices();
            setDevices(rows);
        } catch (err: any) {
            setError(err?.error || "Error loading dashboard.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchDevices();
    }, [user?.id]);

    useEffect(() => {
        if (devices.length === 0) {
            setSelectedDeviceCode("");
            return;
        }
        if (!selectedDeviceCode || !devices.some((device) => device.code === selectedDeviceCode)) {
            setSelectedDeviceCode(devices[0].code);
        }
    }, [devices, selectedDeviceCode]);

    const selectedDevice = useMemo(
        () => devices.find((device) => device.code === selectedDeviceCode) || null,
        [devices, selectedDeviceCode]
    );

    if (authLoading) {
        return (
            <div className="home-page">
                <div className="home-loading">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="home-page home-page-centered">
                <section className="home-auth-panel">
                    <h1>Device dashboard</h1>
                    <p>Sign in to view your ESP32 devices.</p>
                    <Link className="home-primary-link" to="/login">
                        Sign in
                    </Link>
                </section>
            </div>
        );
    }

    return (
        <div className="home-page">
            <header className="home-header">
                <div>
                    <span className="home-kicker">Dashboard</span>
                    <h1>Device dashboard</h1>
                    <p>{user.email}</p>
                </div>
                <div className="home-header-actions">
                    <button className="home-secondary-button" type="button" onClick={fetchDevices} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh"}
                    </button>
                    <Link className="app-action-button" to="/devices">
                        Add device
                    </Link>
                </div>
            </header>

            {loading && devices.length === 0 ? (
                <div className="home-loading">Loading devices...</div>
            ) : devices.length === 0 ? (
                <section className="home-empty">
                    <h2>No devices yet</h2>
                    <p>Add or register a device to see its widgets here.</p>
                    <Link className="home-primary-link" to="/devices">
                        Add device
                    </Link>
                </section>
            ) : (
                <section className="home-dashboard-shell">
                    <aside className="home-device-rail" aria-label="Devices">
                        <div className="home-device-list">
                            {devices.map((device) => (
                                <button
                                    key={device.code}
                                    type="button"
                                    className={
                                        device.code === selectedDeviceCode
                                            ? "home-device-tab selected"
                                            : "home-device-tab"
                                    }
                                    onClick={() => setSelectedDeviceCode(device.code)}
                                >
                                    <DeviceAvailability device={device} entries={stream.entries} connected={stream.connected} compact />
                                    <span className="home-device-tab-text">
                                        <strong>{device.name}</strong>
                                        <small>{device.device_type_description || device.device_type_id}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </aside>

                    {selectedDevice && (
                        <div className="home-board">
                            <section className="home-board-header">
                                <div>
                                    <span className="home-kicker">Selected device</span>
                                    <h2>{selectedDevice.name}</h2>
                                    <p>{selectedDevice.device_type_description || selectedDevice.device_type_id}</p>
                                </div>
                                <div className="home-board-badges">
                                    <DeviceAvailability device={selectedDevice} entries={stream.entries} connected={stream.connected} />
                                    <span className="home-chip">{selectedDevice.owner_email || "Unassigned"}</span>
                                    <span className="home-chip">FW {selectedDevice.firmware_version || "-"}</span>
                                </div>
                            </section>

                            {selectedDevice.mqtt_available !== false && <DashboardWidgets
                                key={`${user.id}:${selectedDevice.code}`}
                                deviceCode={selectedDevice.code} entries={stream.entries} connected={stream.connected}
                            />}
                            {stream.error && <p role="alert">{stream.error}</p>}

                            <div className="home-board-footer">
                                <Link className="home-device-link" to="/devices">
                                    Open device management
                                </Link>
                            </div>
                        </div>
                    )}
                </section>
            )}

            <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
    );
};

export default HomePage;
