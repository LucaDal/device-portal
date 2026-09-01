import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DeviceWithRelations } from "@shared/types/device";
import {
    DEVICE_WIDGET_KINDS,
    DashboardWidgetValue,
    DeviceDashboardWidgetRuntime,
    readDashboardStateValue,
} from "@shared/types/device_type_mqtt";
import { mqttTopicMatches } from "@shared/types/mqtt";
import { ROLES, Role } from "@shared/constants/auth";
import { useAuth } from "../auth/AuthContext";
import {
    getDeviceDashboardWidgets,
    getDevices,
    runDeviceDashboardWidgetAction,
} from "../devices/deviceService";
import ErrorBanner from "../components/ErrorBanner";
import { getApiUrl } from "../api/apiClient";
import "../style/HomePage.css";

const canSeeRealtimeStatus = (role?: Role): boolean => {
    return role === ROLES.ADMIN || role === ROLES.DEV;
};

const getMqttWidgetClassName = (widget: DeviceDashboardWidgetRuntime): string => {
    if (widget.kind === DEVICE_WIDGET_KINDS.BUTTON) return "home-widget button";
    if (widget.kind === DEVICE_WIDGET_KINDS.SWITCH) return "home-widget switch";
    if (widget.kind === DEVICE_WIDGET_KINDS.VALUE) return "home-widget value";
    if (widget.kind === DEVICE_WIDGET_KINDS.INPUT) return "home-widget input";
    return "home-widget text";
};

const getDisplayValue = (value: unknown): unknown => {
    return readDashboardStateValue(value);
};

const formatMqttLiveValue = (value: unknown, fallback = "-"): string => {
    const displayValue = getDisplayValue(value);
    if (displayValue === null || typeof displayValue === "undefined" || displayValue === "") {
        return fallback;
    }
    if (typeof displayValue === "boolean") {
        return displayValue ? "On" : "Off";
    }
    if (typeof displayValue === "object") {
        return JSON.stringify(displayValue);
    }
    return String(displayValue);
};

const dashboardValuesEqual = (
    value: unknown,
    configuredValue: DashboardWidgetValue
): boolean => {
    const displayValue = getDisplayValue(value);
    if (typeof displayValue === typeof configuredValue) {
        return displayValue === configuredValue;
    }
    return String(displayValue ?? "").trim() === String(configuredValue).trim();
};

const isLiveValueOn = (value: unknown): boolean => {
    const displayValue = getDisplayValue(value);
    if (typeof displayValue === "boolean") return displayValue;
    const normalized = String(displayValue ?? "").trim().toLowerCase();
    return ["1", "true", "on", "yes"].includes(normalized);
};

const getConfiguredSwitchState = (
    value: unknown,
    onValue?: DashboardWidgetValue,
    offValue?: DashboardWidgetValue
): boolean | undefined => {
    if (typeof value === "undefined") return undefined;
    if (typeof onValue !== "undefined" && dashboardValuesEqual(value, onValue)) {
        return true;
    }
    if (typeof offValue !== "undefined" && dashboardValuesEqual(value, offValue)) {
        return false;
    }
    if (typeof onValue !== "undefined" || typeof offValue !== "undefined") {
        return undefined;
    }
    return isLiveValueOn(value);
};

type MqttLiveEntry = {
    value: unknown;
    receivedAt: string;
};

const getMqttLiveValue = (
    values: Record<string, MqttLiveEntry>,
    topicPattern: string
): unknown => {
    const exact = values[topicPattern];
    if (exact) return exact.value;

    let latest: MqttLiveEntry | undefined;
    for (const [topic, entry] of Object.entries(values)) {
        if (!mqttTopicMatches(topicPattern, topic)) continue;
        if (!latest || entry.receivedAt > latest.receivedAt) {
            latest = entry;
        }
    }
    return latest?.value;
};

const HomePage = () => {
    const { user, loading: authLoading } = useAuth();
    const showRealtimeStatus = canSeeRealtimeStatus(user?.role);
    const [devices, setDevices] = useState<DeviceWithRelations[]>([]);
    const [selectedDeviceCode, setSelectedDeviceCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [publishingWidgetId, setPublishingWidgetId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mqttLiveValues, setMqttLiveValues] = useState<Record<string, MqttLiveEntry>>({});
    const [mqttStreamConnected, setMqttStreamConnected] = useState(false);
    const [mqttStreamTopicCount, setMqttStreamTopicCount] = useState<number | null>(null);
    const [dashboardWidgets, setDashboardWidgets] = useState<DeviceDashboardWidgetRuntime[]>([]);
    const [switchWidgetStates, setSwitchWidgetStates] = useState<Record<string, boolean>>({});
    const [widgetInputValues, setWidgetInputValues] = useState<Record<string, string>>({});

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
        if (!user) {
            setMqttLiveValues({});
            setMqttStreamConnected(false);
            setMqttStreamTopicCount(null);
            return;
        }

        const source = new EventSource(getApiUrl("/mqtt/stream"), {
            withCredentials: true,
        });

        const handleReady = (event: Event) => {
            setMqttStreamConnected(true);
            try {
                const payload = JSON.parse((event as MessageEvent).data) as { topics?: number };
                setMqttStreamTopicCount(
                    typeof payload.topics === "number" ? payload.topics : null
                );
            } catch {
                setMqttStreamTopicCount(null);
            }
        };

        const handleMessage = (event: Event) => {
            try {
                const message = JSON.parse((event as MessageEvent).data) as {
                    topic?: string;
                    content?: unknown;
                    payload?: unknown;
                    receivedAt?: string;
                };
                if (!message.topic) return;
                setMqttLiveValues((current) => ({
                    ...current,
                    [message.topic as string]: {
                        value: typeof message.content === "undefined"
                            ? message.payload
                            : message.content,
                        receivedAt: message.receivedAt || new Date().toISOString(),
                    },
                }));
            } catch {
                // Ignore malformed stream events; the connection remains usable.
            }
        };

        const handleStreamError = (event: Event) => {
            try {
                const payload = JSON.parse((event as MessageEvent).data) as { error?: string };
                if (payload.error) {
                    setError(payload.error);
                }
            } catch {
                setError("Realtime MQTT stream is not available.");
            }
        };

        source.addEventListener("ready", handleReady);
        source.addEventListener("mqtt-message", handleMessage);
        source.addEventListener("mqtt-error", handleStreamError);
        source.onerror = () => {
            setMqttStreamConnected(false);
        };

        return () => {
            source.removeEventListener("ready", handleReady);
            source.removeEventListener("mqtt-message", handleMessage);
            source.removeEventListener("mqtt-error", handleStreamError);
            source.close();
        };
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

    useEffect(() => {
        if (!selectedDevice) {
            setDashboardWidgets([]);
            setSwitchWidgetStates({});
            setWidgetInputValues({});
            return;
        }
        let cancelled = false;
        setDashboardWidgets([]);
        setSwitchWidgetStates({});
        setWidgetInputValues({});
        void getDeviceDashboardWidgets(selectedDevice.code)
            .then((result) => {
                if (!cancelled) setDashboardWidgets(result.widgets);
            })
            .catch((err: any) => {
                if (!cancelled) setError(err?.error || "Error loading device widgets.");
            });
        return () => {
            cancelled = true;
        };
    }, [selectedDevice?.code]);

    useEffect(() => {
        setSwitchWidgetStates((current) => {
            let next = current;
            for (const widget of dashboardWidgets) {
                if (widget.kind !== DEVICE_WIDGET_KINDS.SWITCH || !widget.stateTopic) {
                    continue;
                }
                const mqttValue = getMqttLiveValue(mqttLiveValues, widget.stateTopic);
                const liveValue = typeof mqttValue !== "undefined"
                    ? readDashboardStateValue(mqttValue, widget.stateValuePath)
                    : undefined;
                const receivedState = getConfiguredSwitchState(
                    liveValue,
                    widget.onValue,
                    widget.offValue
                );
                if (
                    typeof receivedState === "undefined" ||
                    current[widget.id] === receivedState
                ) {
                    continue;
                }
                if (next === current) next = { ...current };
                next[widget.id] = receivedState;
            }
            return next;
        });
    }, [dashboardWidgets, mqttLiveValues]);

    const handleWidgetAction = async (
        widget: DeviceDashboardWidgetRuntime,
        input: { state?: boolean; value?: DashboardWidgetValue } = {}
    ) => {
        if (!selectedDevice) return;
        try {
            setPublishingWidgetId(widget.id);
            setError(null);
            const result = await runDeviceDashboardWidgetAction(
                selectedDevice.code,
                widget.id,
                input
            );
            if (typeof result.state === "boolean") {
                setSwitchWidgetStates((current) => ({
                    ...current,
                    [widget.id]: result.state,
                }));
            }
        } catch (err: any) {
            setError(err?.error || "Error while publishing MQTT message.");
        } finally {
            setPublishingWidgetId(null);
        }
    };

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
                    <p>Add or register a device to start seeing its visible properties here.</p>
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
                                    <span className={device.activated ? "home-dot active" : "home-dot inactive"} />
                                    <span className="home-device-tab-text">
                                        <strong>{device.code}</strong>
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
                                    <h2>{selectedDevice.code}</h2>
                                    <p>{selectedDevice.device_type_description || selectedDevice.device_type_id}</p>
                                </div>
                                <div className="home-board-badges">
                                    <span className={selectedDevice.activated ? "home-status active" : "home-status inactive"}>
                                        {selectedDevice.activated ? "Active" : "Inactive"}
                                    </span>
                                    <span className="home-chip">
                                        {selectedDevice.is_shared ? "Shared" : "Owner"}
                                    </span>
                                    <span className="home-chip">FW {selectedDevice.firmware_version || "-"}</span>
                                </div>
                            </section>

                            {dashboardWidgets.length > 0 ? (
                                <section className="home-widget-grid" aria-label="MQTT dashboard widgets">
                                    {dashboardWidgets.map((widget) => {
                                        const mqttValue = widget.stateTopic
                                            ? getMqttLiveValue(mqttLiveValues, widget.stateTopic)
                                            : undefined;
                                        const hasMqttValue = typeof mqttValue !== "undefined";
                                        const liveValue = typeof mqttValue !== "undefined"
                                            ? readDashboardStateValue(mqttValue, widget.stateValuePath)
                                            : undefined;
                                        const hasLiveValue = typeof liveValue !== "undefined";
                                        const isPublishing = publishingWidgetId === widget.id;
                                        const receivedSwitchState = getConfiguredSwitchState(
                                            liveValue,
                                            widget.onValue,
                                            widget.offValue
                                        );
                                        const switchIsOn = receivedSwitchState
                                            ?? switchWidgetStates[widget.id]
                                            ?? false;
                                        return (
                                            <article className={getMqttWidgetClassName(widget)} key={widget.id}>
                                                <div className="home-widget-head">
                                                    <span>{widget.label}</span>
                                                    <small>
                                                        {showRealtimeStatus
                                                            ? hasLiveValue
                                                                ? "live"
                                                                : hasMqttValue
                                                                    ? "invalid state"
                                                                    : widget.stateTopic
                                                                        ? mqttStreamTopicCount === 0
                                                                            ? "no topics"
                                                                            : mqttStreamConnected
                                                                                ? "waiting"
                                                                                : "offline"
                                                                        : widget.kind
                                                            : widget.kind}
                                                    </small>
                                                </div>

                                                {widget.kind === DEVICE_WIDGET_KINDS.BUTTON ? (
                                                    <button
                                                        type="button"
                                                        className="home-action-button"
                                                        disabled={isPublishing || !widget.configured}
                                                        onClick={() => handleWidgetAction(widget)}
                                                    >
                                                        {isPublishing
                                                            ? "Sending..."
                                                            : widget.configured ? "Send" : "Not configured"}
                                                    </button>
                                                ) : widget.kind === DEVICE_WIDGET_KINDS.SWITCH ? (
                                                    <div className="home-switch-widget">
                                                        <button
                                                            type="button"
                                                            className={switchIsOn ? "home-switch on" : "home-switch"}
                                                            aria-pressed={switchIsOn}
                                                            aria-label={`${widget.label}: ${switchIsOn ? "on" : "off"}`}
                                                            disabled={isPublishing || !widget.configured}
                                                            onClick={() => handleWidgetAction(widget, {
                                                                state: !switchIsOn,
                                                            })}
                                                        >
                                                            <span />
                                                        </button>
                                                    </div>
                                                ) : widget.kind === DEVICE_WIDGET_KINDS.INPUT ? (
                                                    <div className="home-input-widget">
                                                        <input
                                                            type="text"
                                                            value={widgetInputValues[widget.id] || ""}
                                                            disabled={isPublishing || !widget.configured}
                                                            onChange={(event) => setWidgetInputValues((current) => ({
                                                                ...current,
                                                                [widget.id]: event.target.value,
                                                            }))}
                                                            aria-label={widget.label}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="home-action-button"
                                                            disabled={
                                                                isPublishing ||
                                                                !widget.configured ||
                                                                !widgetInputValues[widget.id]?.trim()
                                                            }
                                                            onClick={() => handleWidgetAction(widget, {
                                                                value: widgetInputValues[widget.id],
                                                            })}
                                                        >
                                                            {isPublishing ? "Sending..." : "Send"}
                                                        </button>
                                                    </div>
                                                ) : widget.kind === DEVICE_WIDGET_KINDS.VALUE ? (
                                                    <div className="home-value-widget">
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : widget.configured ? "-" : "Not configured"}
                                                        </strong>
                                                    </div>
                                                ) : (
                                                    <div className="home-text-widget">
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : widget.configured ? "-" : "Not configured"}
                                                        </strong>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </section>
                            ) : (
                                <section className="home-empty inline">
                                    <h2>No widgets configured</h2>
                                    <p>This device type has no dashboard widgets.</p>
                                </section>
                            )}

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
