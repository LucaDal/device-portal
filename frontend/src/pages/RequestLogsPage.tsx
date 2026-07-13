import { useEffect, useState } from "react";
import { DeviceRequestLogRow, getRequestLogs } from "../admin/adminService";
import ErrorBanner from "../components/ErrorBanner";
import "../style/DeviceTypesPage.css";

const EVENT_TYPES = [
    { value: "", label: "All events" },
    { value: "ota_properties", label: "OTA properties" },
    { value: "ota_build", label: "OTA build" },
    { value: "ota_version", label: "OTA version" },
    { value: "mqtt_api_publish", label: "MQTT API publish" },
];

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClass(status: number | null): string {
    if (!status) return "dt-chip";
    if (status >= 200 && status < 300) return "dt-chip request-log-ok";
    if (status >= 400) return "dt-chip request-log-error";
    return "dt-chip";
}

export default function RequestLogsPage() {
    const [logs, setLogs] = useState<DeviceRequestLogRow[]>([]);
    const [eventType, setEventType] = useState("");
    const [deviceCode, setDeviceCode] = useState("");
    const [limit, setLimit] = useState(100);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function loadLogs(nextFilters = { eventType, deviceCode, limit }) {
        try {
            setLoading(true);
            setError(null);
            const rows = await getRequestLogs({
                eventType: nextFilters.eventType || undefined,
                deviceCode: nextFilters.deviceCode.trim() || undefined,
                limit: nextFilters.limit,
            });
            setLogs(rows);
        } catch (err: any) {
            setError(err?.error || "Error loading request logs.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            void loadLogs({ eventType, deviceCode, limit });
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [eventType, limit]);

    return (
        <div className="device-types-page">
            <header className="dt-header">
                <h1>Request Logs</h1>
                <p>Review device OTA requests, property requests, and MQTT API publishes.</p>
            </header>

            <section className="dt-card dt-form-card request-logs-card">
                <div className="dt-form-header">
                    <h2>Filters</h2>
                    <button
                        type="button"
                        className="dt-btn dt-btn-primary"
                        onClick={() => loadLogs({ eventType, deviceCode, limit })}
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>

                <div className="request-log-filters">
                    <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                        {EVENT_TYPES.map((type) => (
                            <option key={type.value || "all"} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={deviceCode}
                        placeholder="Device code"
                        onChange={(e) => setDeviceCode(e.target.value)}
                        onBlur={() => loadLogs({ eventType, deviceCode, limit })}
                    />
                    <input
                        type="number"
                        min={1}
                        max={500}
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                    />
                </div>
            </section>

            <section className="dt-card dt-table-card">
                <div className="dt-table-header">
                    <h2>Logs</h2>
                    <span className="dt-small">{logs.length} rows</span>
                </div>

                {loading ? (
                    <p className="dt-loading">Loading logs...</p>
                ) : logs.length === 0 ? (
                    <p className="dt-empty">No logs found.</p>
                ) : (
                    <div className="dt-table-wrapper">
                        <table className="dt-table request-log-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Event</th>
                                    <th>Status</th>
                                    <th>Device</th>
                                    <th>Topic / Path</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td>{formatDate(log.created_at)}</td>
                                        <td>{log.event_type}</td>
                                        <td>
                                            <span className={statusClass(log.status_code)}>
                                                {log.status_code || "-"}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="request-log-stack">
                                                <strong>{log.device_code || "-"}</strong>
                                                {log.device_type_id ? <span>{log.device_type_id}</span> : null}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="request-log-stack">
                                                <strong>{log.topic || log.path}</strong>
                                                {log.topic ? <span>{log.path}</span> : null}
                                                {log.error ? <span className="request-log-error-text">{log.error}</span> : null}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="request-log-stack">
                                                <strong>{log.user_email || log.ip || "-"}</strong>
                                                {log.user_agent ? <span>{log.user_agent}</span> : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <ErrorBanner message={error} />
        </div>
    );
}
