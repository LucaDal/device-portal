import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DeviceWithRelations } from "@shared/types/device";
import { PropertyType } from "@shared/types/properties";
import {
    DEVICE_TYPE_WIDGET_KINDS,
    DeviceTypeDashboardWidget,
    DeviceTypeMqttTopic,
    parseDeviceTypeDashboardWidgets,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";
import { ROLES, Role } from "@shared/constants/auth";
import { useAuth } from "../auth/AuthContext";
import { getDevices, publishMqttWithSession } from "../devices/deviceService";
import { DevicePropertyRow, buildPropertyRows } from "../devices/deviceProperties";
import ErrorBanner from "../components/ErrorBanner";
import { getApiUrl } from "../api/apiClient";
import "../style/HomePage.css";

const formatPropertyValue = (type: PropertyType, value: string): string => {
    if (!value) return "-";
    if (type === PropertyType.BOOL) {
        return value === "true" ? "On" : "Off";
    }
    return value;
};

const getWidgetClassName = (type: PropertyType): string => {
    if (type === PropertyType.BOOL) return "home-widget switch";
    if (type === PropertyType.INT || type === PropertyType.UINT || type === PropertyType.FLOAT) return "home-widget value";
    return "home-widget text";
};

const hasPropertyMqttWidget = (property: DevicePropertyRow): boolean => {
    return Boolean(property.mqtt?.publishTopic || property.mqtt?.subscribeTopic);
};

const canSeePropertyKey = (role?: Role): boolean => {
    return role === ROLES.ADMIN || role === ROLES.DEV;
};

const renderPropertyName = (property: DevicePropertyRow, showKey: boolean) => {
    if (!property.label) return property.key;
    if (!showKey) return property.label;
    return (
        <>
            {property.label}
            <small>{property.key}</small>
        </>
    );
};

const getMqttWidgetClassName = (widget: DeviceTypeDashboardWidget): string => {
    if (widget.kind === DEVICE_TYPE_WIDGET_KINDS.BUTTON) return "home-widget button";
    if (widget.kind === DEVICE_TYPE_WIDGET_KINDS.SWITCH) return "home-widget switch";
    if (widget.kind === DEVICE_TYPE_WIDGET_KINDS.VALUE) return "home-widget value";
    if (widget.kind === DEVICE_TYPE_WIDGET_KINDS.INPUT) return "home-widget input";
    return "home-widget text";
};

const resolveTopicTemplate = (topic: string, device: DeviceWithRelations): string => {
    return topic
        .replace(/\{deviceCode\}/g, device.code)
        .replace(/\{ownerId\}/g, String(device.owner_id || ""))
        .replace(/\{deviceTypeId\}/g, device.device_type_id);
};

const getDisplayValue = (value: unknown): unknown => {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.prototype.hasOwnProperty.call(value, "value")
    ) {
        return (value as { value: unknown }).value;
    }
    return value;
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

const isLiveValueOn = (value: unknown): boolean => {
    const displayValue = getDisplayValue(value);
    if (typeof displayValue === "boolean") return displayValue;
    const normalized = String(displayValue ?? "").trim().toLowerCase();
    return ["1", "true", "on", "yes"].includes(normalized);
};

const HomePage = () => {
    const { user, loading: authLoading } = useAuth();
    const showPropertyKey = canSeePropertyKey(user?.role);
    const [devices, setDevices] = useState<DeviceWithRelations[]>([]);
    const [selectedDeviceCode, setSelectedDeviceCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [publishingWidgetId, setPublishingWidgetId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mqttLiveValues, setMqttLiveValues] = useState<Record<string, unknown>>({});
    const [mqttStreamConnected, setMqttStreamConnected] = useState(false);

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
            return;
        }

        const source = new EventSource(getApiUrl("/mqtt/stream"), {
            withCredentials: true,
        });

        const handleReady = () => {
            setMqttStreamConnected(true);
        };

        const handleMessage = (event: Event) => {
            try {
                const message = JSON.parse((event as MessageEvent).data) as {
                    topic?: string;
                    content?: unknown;
                    payload?: unknown;
                };
                if (!message.topic) return;
                setMqttLiveValues((current) => ({
                    ...current,
                    [message.topic as string]: typeof message.content === "undefined"
                        ? message.payload
                        : message.content,
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

    const metrics = useMemo(() => {
        const total = devices.length;
        const active = devices.filter((device) => Boolean(device.activated)).length;
        const shared = devices.filter((device) => Boolean(device.is_shared)).length;
        return { total, active, shared };
    }, [devices]);

    const selectedDevice = useMemo(
        () => devices.find((device) => device.code === selectedDeviceCode) || null,
        [devices, selectedDeviceCode]
    );

    const selectedProperties = useMemo(
        () => (selectedDevice ? buildPropertyRows(selectedDevice) : []),
        [selectedDevice]
    );

    const selectedMqttTopics = useMemo(
        () => (selectedDevice ? parseDeviceTypeMqttTopics(selectedDevice.type_mqttTopics) : []),
        [selectedDevice]
    );

    const selectedDashboardWidgets = useMemo(
        () => (selectedDevice ? parseDeviceTypeDashboardWidgets(selectedDevice.type_dashboardWidgets) : []),
        [selectedDevice]
    );

    const selectedMqttProperties = useMemo(
        () => selectedProperties.filter(hasPropertyMqttWidget),
        [selectedProperties]
    );

    const handlePublishWidget = async (
        widget: DeviceTypeDashboardWidget,
        topic: DeviceTypeMqttTopic | undefined
    ) => {
        if (!selectedDevice || !topic) {
            setError("Missing MQTT topic for this widget.");
            return;
        }

        if (typeof widget.publishValue === "undefined" && !widget.payload) {
            setError(`Missing publish value for widget "${widget.label}".`);
            return;
        }

        try {
            setPublishingWidgetId(widget.id);
            setError(null);
            await publishMqttWithSession({
                topic: resolveTopicTemplate(topic.topic, selectedDevice),
                content: widget.payload || { value: widget.publishValue },
            });
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
                    <Link className="home-primary-link" to="/devices">
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
                        <div className="home-metrics compact" aria-label="Device summary">
                            <article className="home-metric">
                                <span>Total</span>
                                <strong>{metrics.total}</strong>
                            </article>
                            <article className="home-metric">
                                <span>Active</span>
                                <strong>{metrics.active}</strong>
                            </article>
                            <article className="home-metric">
                                <span>Shared</span>
                                <strong>{metrics.shared}</strong>
                            </article>
                        </div>

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

                            {selectedDashboardWidgets.length > 0 ? (
                                <section className="home-widget-grid" aria-label="MQTT dashboard widgets">
                                    {selectedDashboardWidgets.map((widget) => {
                                        const topic = selectedMqttTopics.find((row) => row.key === widget.topicKey);
                                        const resolvedTopic = topic && selectedDevice
                                            ? resolveTopicTemplate(topic.topic, selectedDevice)
                                            : "";
                                        const liveValue = resolvedTopic ? mqttLiveValues[resolvedTopic] : undefined;
                                        const hasLiveValue = typeof liveValue !== "undefined";
                                        return (
                                            <article className={getMqttWidgetClassName(widget)} key={widget.id}>
                                                <div className="home-widget-head">
                                                    <span>{widget.label}</span>
                                                    <small>{mqttStreamConnected ? "live" : widget.kind}</small>
                                                </div>

                                                {widget.kind === DEVICE_TYPE_WIDGET_KINDS.BUTTON ? (
                                                    <button
                                                        type="button"
                                                        className="home-action-button"
                                                        disabled={
                                                            publishingWidgetId === widget.id ||
                                                            !topic
                                                        }
                                                        onClick={() => handlePublishWidget(widget, topic)}
                                                    >
                                                        {publishingWidgetId === widget.id
                                                            ? "Sending..."
                                                            : `Send ${typeof widget.publishValue === "undefined"
                                                                ? "payload"
                                                                : String(widget.publishValue)
                                                            }`}
                                                    </button>
                                                ) : widget.kind === DEVICE_TYPE_WIDGET_KINDS.SWITCH ? (
                                                    <div className="home-switch-widget">
                                                        <span className={isLiveValueOn(liveValue) ? "home-switch on" : "home-switch"}>
                                                            <span />
                                                        </span>
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : topic?.key || "-"}
                                                        </strong>
                                                    </div>
                                                ) : widget.kind === DEVICE_TYPE_WIDGET_KINDS.VALUE ? (
                                                    <div className="home-value-widget">
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : topic?.key || "-"}
                                                        </strong>
                                                    </div>
                                                ) : (
                                                    <div className="home-text-widget">
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : resolvedTopic || "No topic"}
                                                        </strong>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </section>
                            ) : selectedMqttProperties.length > 0 ? (
                                <section className="home-widget-grid" aria-label="Property MQTT widgets">
                                    {selectedMqttProperties.map((property) => {
                                        const liveTopic = property.mqtt?.publishTopic && selectedDevice
                                            ? resolveTopicTemplate(property.mqtt.publishTopic, selectedDevice)
                                            : "";
                                        const liveValue = liveTopic ? mqttLiveValues[liveTopic] : undefined;
                                        const hasLiveValue = typeof liveValue !== "undefined";
                                        const boolValue = hasLiveValue
                                            ? isLiveValueOn(liveValue)
                                            : property.value === "true";
                                        return (
                                            <article className={getWidgetClassName(property.type)} key={property.key}>
                                                <div className="home-widget-head">
                                                    <span>{renderPropertyName(property, showPropertyKey)}</span>
                                                    <small>{hasLiveValue ? "live" : property.type}</small>
                                                </div>

                                                {property.type === PropertyType.BOOL ? (
                                                    <div className="home-switch-widget">
                                                        <span className={boolValue ? "home-switch on" : "home-switch"}>
                                                            <span />
                                                        </span>
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : formatPropertyValue(property.type, property.value)}
                                                        </strong>
                                                    </div>
                                                ) : property.type === PropertyType.INT ||
                                                    property.type === PropertyType.UINT ||
                                                    property.type === PropertyType.FLOAT ? (
                                                    <div className="home-value-widget">
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : formatPropertyValue(property.type, property.value)}
                                                        </strong>
                                                    </div>
                                                ) : (
                                                    <div className="home-text-widget">
                                                        <strong>
                                                            {hasLiveValue
                                                                ? formatMqttLiveValue(liveValue)
                                                                : property.mqtt?.publishTopic ||
                                                                    property.mqtt?.subscribeTopic ||
                                                                    formatPropertyValue(property.type, property.value)}
                                                        </strong>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </section>
                            ) : selectedProperties.length === 0 ? (
                                <section className="home-empty inline">
                                    <h2>No visible widgets</h2>
                                    <p>Configure MQTT widgets or enable at least one visible property on this device type.</p>
                                </section>
                            ) : (
                                <section className="home-widget-grid" aria-label="Device widgets">
                                    {selectedProperties.map((property) => {
                                        const boolValue = property.value === "true";
                                        return (
                                            <article className={getWidgetClassName(property.type)} key={property.key}>
                                                <div className="home-widget-head">
                                                    <span>{renderPropertyName(property, showPropertyKey)}</span>
                                                    <small>{property.type}</small>
                                                </div>

                                                {property.type === PropertyType.BOOL ? (
                                                    <div className="home-switch-widget">
                                                        <span className={boolValue ? "home-switch on" : "home-switch"}>
                                                            <span />
                                                        </span>
                                                        <strong>{formatPropertyValue(property.type, property.value)}</strong>
                                                    </div>
                                                ) : property.type === PropertyType.INT ||
                                                    property.type === PropertyType.UINT ||
                                                    property.type === PropertyType.FLOAT ? (
                                                    <div className="home-value-widget">
                                                        <strong>{formatPropertyValue(property.type, property.value)}</strong>
                                                    </div>
                                                ) : (
                                                    <div className="home-text-widget">
                                                        <strong>{formatPropertyValue(property.type, property.value)}</strong>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
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

            <ErrorBanner message={error} />
        </div>
    );
};

export default HomePage;
