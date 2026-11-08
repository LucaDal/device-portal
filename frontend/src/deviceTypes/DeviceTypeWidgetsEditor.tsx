import { useEffect, useState } from "react";
import {
    DeviceDashboardWidget, DeviceTypeWidgetConfiguration, DeviceWidgetKind,
    WIDGET_TYPES, parseDeviceDashboardWidgets,
} from "@shared/widgets";
import { getDeviceTypeWidgets, updateDeviceTypeWidgets } from "../devices/deviceService";
import WidgetDefinitionEditor from "../widgets/WidgetDefinitionEditor";
import "../widgets/WidgetEditor.css";

type Props = { deviceTypeId: string; onError: (message: string) => void; onSaved: (message: string) => void };

function freshWidget(kind: DeviceWidgetKind, configuration: DeviceTypeWidgetConfiguration, id: string = crypto.randomUUID()): DeviceDashboardWidget {
    const widget = WIDGET_TYPES[kind].create(id);
    if (widget.state) widget.state.topicKey = configuration.topics.find((topic) => topic.key === "telemetry")?.key || configuration.topics.find((topic) => topic.action !== "subscribe" && topic.key !== "availability")?.key || configuration.topics[0]?.key || "";
    if ("command" in widget) widget.command.topicKey = configuration.topics.find((topic) => topic.action !== "publish")?.key || "";
    return widget;
}

export default function DeviceTypeWidgetsEditor({ deviceTypeId, onError, onSaved }: Props) {
    const [configuration, setConfiguration] = useState<DeviceTypeWidgetConfiguration | null>(null);
    const [widgets, setWidgets] = useState<DeviceDashboardWidget[]>([]);
    const [errors, setErrors] = useState<Record<string, string | undefined>>({});
    const [kind, setKind] = useState<DeviceWidgetKind>("value");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setConfiguration(null);
        setWidgets([]);
        setErrors({});
        void getDeviceTypeWidgets(deviceTypeId).then((response) => {
            if (cancelled) return;
            setConfiguration(response.configuration);
            setWidgets(response.configuration.widgets);
        }).catch((error: { error?: string }) => {
            if (!cancelled) onError(error?.error || "Error loading device type widgets.");
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [deviceTypeId, onError, reload]);

    function update(widget: DeviceDashboardWidget) {
        setWidgets((current) => current.map((item) => item.id === widget.id ? widget : item));
    }

    function move(index: number, direction: number) {
        setWidgets((current) => {
            const next = [...current];
            [next[index], next[index + direction]] = [next[index + direction], next[index]];
            return next;
        });
    }

    async function save() {
        if (!configuration) return;
        try {
            const error = Object.values(errors).find(Boolean);
            if (error) throw new Error(error);
            const validated = parseDeviceDashboardWidgets(widgets, configuration.topics);
            setSaving(true);
            const response = await updateDeviceTypeWidgets(deviceTypeId, validated, configuration.revision);
            setConfiguration(response.configuration);
            setWidgets(response.configuration.widgets);
            setErrors({});
            onSaved("Device type widgets saved for all devices of this type.");
        } catch (error) {
            const failure = error as { error?: string; message?: string };
            onError(failure.error || failure.message || "Error saving device type widgets.");
        } finally { setSaving(false); }
    }

    return <div className="dt-form-group device-type-widget-editor">
        <div className="dt-divider" />
        <div className="widget-editor-heading">
            <h3>Dashboard widgets</h3>
            <select aria-label="New widget type" value={kind} disabled={loading || saving} onChange={(event) => setKind(event.target.value as DeviceWidgetKind)}>
                {Object.values(WIDGET_TYPES).map((type) => <option key={type.kind} value={type.kind}>{type.label}</option>)}
            </select>
            <button type="button" className="dt-btn dt-btn-xs dt-btn-outline" disabled={loading || saving || !configuration}
                onClick={() => configuration && setWidgets((current) => [...current, freshWidget(kind, configuration)])}>+ Add widget</button>
        </div>
        {loading ? <p className="dt-loading">Loading device type widgets...</p>
            : !configuration ? <p className="dt-empty">Widget configuration is unavailable.</p>
                : <fieldset className="widget-editor-content" disabled={saving}>
                    {widgets.length === 0 && <p className="dt-empty">No widgets are defined for this device type.</p>}
                    <div className="device-widget-bindings">
                        {widgets.map((widget, index) => <div className="device-widget-binding" key={`${configuration.revision}:${widget.id}`}>
                            <div className="device-widget-binding-head">
                                <strong>{widget.label}</strong>
                                <button type="button" className="dt-btn dt-btn-xs dt-btn-outline" disabled={index === 0} aria-label={`Move ${widget.label} up`} onClick={() => move(index, -1)}>↑</button>
                                <button type="button" className="dt-btn dt-btn-xs dt-btn-outline" disabled={index === widgets.length - 1} aria-label={`Move ${widget.label} down`} onClick={() => move(index, 1)}>↓</button>
                                <button type="button" className="dt-btn dt-btn-xs dt-btn-danger" aria-label={`Remove ${widget.label}`} onClick={() => {
                                    setWidgets((current) => current.filter((item) => item.id !== widget.id));
                                    setErrors((current) => ({ ...current, [widget.id]: undefined }));
                                }}>✕</button>
                            </div>
                            <WidgetDefinitionEditor key={widget.kind} widget={widget} topics={configuration.topics} onChange={update}
                                onValidationError={(error) => setErrors((current) => ({ ...current, [widget.id]: error }))}
                                onKindChange={(nextKind) => {
                                    update({ ...freshWidget(nextKind, configuration, widget.id), label: widget.label });
                                    setErrors((current) => ({ ...current, [widget.id]: undefined }));
                                }} />
                            {errors[widget.id] && <p role="alert">{errors[widget.id]}</p>}
                        </div>)}
                    </div>
                </fieldset>}
        <div className="widget-editor-actions">
            {configuration && !loading && <button type="button" className="dt-btn dt-btn-primary" onClick={() => void save()}
                disabled={saving || Object.values(errors).some(Boolean)}>{saving ? "Saving..." : "Save widgets"}</button>}
            <button type="button" className="dt-btn dt-btn-outline" disabled={loading || saving} onClick={() => setReload((value) => value + 1)}>Reload saved widgets</button>
        </div>
    </div>;
}
