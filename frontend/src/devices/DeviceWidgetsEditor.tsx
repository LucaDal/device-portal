import { useEffect, useState } from "react";
import {
    DEVICE_WIDGET_KINDS,
    DashboardWidgetValue,
    DeviceDashboardWidget,
    DeviceDashboardWidgetConfiguration,
    DeviceWidgetKind,
} from "@shared/types/device_type_mqtt";
import { getDeviceDashboardWidgets, updateDeviceDashboardWidgets } from "./deviceService";

type Props = {
    deviceCode: string;
    onError: (message: string) => void;
    onSaved: (message: string) => void;
};

function toWidgetValue(value: string): DashboardWidgetValue {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
    return value;
}

function withoutKindSpecificValues(
    widget: DeviceDashboardWidget,
    kind: DeviceWidgetKind
): DeviceDashboardWidget {
    const { publishValue, payload, onValue, offValue, ...common } = widget;
    return { ...common, kind };
}

export default function DeviceWidgetsEditor({ deviceCode, onError, onSaved }: Props) {
    const [configuration, setConfiguration] =
        useState<DeviceDashboardWidgetConfiguration | null>(null);
    const [widgets, setWidgets] = useState<DeviceDashboardWidget[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setConfiguration(null);
        setWidgets([]);

        void getDeviceDashboardWidgets(deviceCode)
            .then((response) => {
                if (cancelled) return;
                const nextConfiguration = response.configuration || null;
                setConfiguration(nextConfiguration);
                setWidgets(nextConfiguration?.widgets || []);
            })
            .catch((error: any) => {
                if (!cancelled) onError(error?.error || "Error loading device widgets.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [deviceCode, onError]);

    const updateWidget = (index: number, patch: Partial<DeviceDashboardWidget>) => {
        setWidgets((current) => current.map((widget, widgetIndex) =>
            widgetIndex === index ? { ...widget, ...patch } : widget
        ));
    };

    const updateOptionalValue = (
        index: number,
        key: "publishValue" | "onValue" | "offValue",
        rawValue: string
    ) => {
        setWidgets((current) => current.map((widget, widgetIndex) => {
            if (widgetIndex !== index) return widget;
            if (rawValue === "") {
                const { [key]: removed, ...rest } = widget;
                return rest as DeviceDashboardWidget;
            }
            return { ...widget, [key]: toWidgetValue(rawValue) };
        }));
    };

    const addWidget = () => {
        setWidgets((current) => [
            ...current,
            {
                id: "",
                label: "",
                kind: DEVICE_WIDGET_KINDS.VALUE,
                topicKey: configuration?.topics[0]?.key || "",
            },
        ]);
    };

    const save = async () => {
        try {
            setSaving(true);
            const response = await updateDeviceDashboardWidgets(deviceCode, widgets);
            const nextConfiguration = response.configuration || null;
            setConfiguration(nextConfiguration);
            setWidgets(nextConfiguration?.widgets || []);
            onSaved("Device widgets saved.");
        } catch (error: any) {
            onError(error?.error || "Error saving device widgets.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="dt-divider" />
            <div className="device-subhead">
                <h5>Dashboard widgets</h5>
                <button
                    type="button"
                    className="dt-btn dt-btn-xs dt-btn-outline"
                    disabled={loading || !configuration}
                    onClick={addWidget}
                >
                    + Add widget
                </button>
            </div>
            {loading ? (
                <p className="dt-loading">Loading device widgets...</p>
            ) : !configuration ? (
                <p className="dt-empty">Widget configuration is unavailable.</p>
            ) : widgets.length === 0 ? (
                <p className="dt-empty">No widgets are defined for this device.</p>
            ) : (
                <div className="device-widget-bindings">
                    {widgets.map((widget, index) => (
                        <div className="device-widget-binding" key={`${widget.id}-${index}`}>
                            <div className="device-widget-binding-head">
                                <input
                                    type="text"
                                    aria-label="Widget ID"
                                    placeholder="Widget ID"
                                    value={widget.id}
                                    onChange={(event) => updateWidget(index, { id: event.target.value })}
                                />
                                <input
                                    type="text"
                                    aria-label="Widget label"
                                    placeholder="Label"
                                    value={widget.label}
                                    onChange={(event) => updateWidget(index, { label: event.target.value })}
                                />
                                <select
                                    aria-label="Widget type"
                                    value={widget.kind}
                                    onChange={(event) => setWidgets((current) => current.map(
                                        (item, widgetIndex) => widgetIndex === index
                                            ? withoutKindSpecificValues(item, event.target.value as DeviceWidgetKind)
                                            : item
                                    ))}
                                >
                                    {Object.values(DEVICE_WIDGET_KINDS).map((kind) => (
                                        <option key={kind} value={kind}>{kind}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="dt-btn dt-btn-xs dt-btn-danger"
                                    onClick={() => setWidgets((current) => current.filter((_, i) => i !== index))}
                                >
                                    ✕
                                </button>
                            </div>

                            <label>
                                MQTT topic
                                <select
                                    value={widget.topicKey}
                                    onChange={(event) => updateWidget(index, { topicKey: event.target.value })}
                                >
                                    <option value="">Select topic...</option>
                                    {configuration.topics.map((topic) => (
                                        <option key={topic.key} value={topic.key}>
                                            {topic.label || topic.key} ({topic.action})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                State topic
                                <select
                                    value={widget.stateTopicKey || ""}
                                    onChange={(event) => updateWidget(index, {
                                        stateTopicKey: event.target.value || undefined,
                                    })}
                                >
                                    <option value="">Use MQTT topic</option>
                                    {configuration.topics.map((topic) => (
                                        <option key={topic.key} value={topic.key}>
                                            {topic.label || topic.key} ({topic.action})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                State JSON pointer
                                <input
                                    type="text"
                                    placeholder="/state"
                                    value={widget.stateValuePath || ""}
                                    onChange={(event) => updateWidget(index, {
                                        stateValuePath: event.target.value || undefined,
                                    })}
                                />
                            </label>

                            {widget.kind === DEVICE_WIDGET_KINDS.BUTTON && (
                                <label>
                                    Value to send
                                    <input
                                        type="text"
                                        value={widget.publishValue === undefined ? "" : String(widget.publishValue)}
                                        onChange={(event) => updateOptionalValue(
                                            index,
                                            "publishValue",
                                            event.target.value
                                        )}
                                    />
                                </label>
                            )}

                            {widget.kind === DEVICE_WIDGET_KINDS.SWITCH && (
                                <>
                                    <label>
                                        ON value
                                        <input
                                            type="text"
                                            value={widget.onValue === undefined ? "" : String(widget.onValue)}
                                            onChange={(event) => updateOptionalValue(index, "onValue", event.target.value)}
                                        />
                                    </label>
                                    <label>
                                        OFF value
                                        <input
                                            type="text"
                                            value={widget.offValue === undefined ? "" : String(widget.offValue)}
                                            onChange={(event) => updateOptionalValue(index, "offValue", event.target.value)}
                                        />
                                    </label>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {!loading && configuration && (
                <button type="button" className="dt-btn dt-btn-primary" disabled={saving} onClick={save}>
                    {saving ? "Saving..." : "Save widgets"}
                </button>
            )}
        </>
    );
}
