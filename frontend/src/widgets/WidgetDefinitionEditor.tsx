import { useState } from "react";
import {
    DeviceDashboardWidget, DeviceWidgetKind, WidgetStateBinding, WIDGET_TYPES,
    ButtonWidget, DashboardWidgetValue,
} from "@shared/widgets";
import { DeviceTypeMqttTopic } from "@shared/types/device_type_mqtt";
import WidgetScalarField from "./WidgetScalarField";

type Props = {
    widget: DeviceDashboardWidget;
    topics: DeviceTypeMqttTopic[];
    onChange: (widget: DeviceDashboardWidget) => void;
    onKindChange: (kind: DeviceWidgetKind) => void;
    onValidationError: (error?: string) => void;
};

function withCommandBinding(widget: Extract<DeviceDashboardWidget, { command: unknown }>, binding: WidgetStateBinding): DeviceDashboardWidget {
    switch (widget.kind) {
        case "switch": return { ...widget, command: { ...widget.command, ...binding, topicSuffix: binding.topicSuffix, path: binding.path } };
        case "input": return { ...widget, command: { ...widget.command, ...binding, topicSuffix: binding.topicSuffix, path: binding.path } };
        case "button": return { ...widget, command: widget.command.mode === "payload"
            ? { ...widget.command, topicKey: binding.topicKey, topicSuffix: binding.topicSuffix }
            : { ...widget.command, ...binding, topicSuffix: binding.topicSuffix, path: binding.path } };
    }
}

function BindingFields({ label, binding, topics, onChange, includePath = true }: {
    label: string; binding: WidgetStateBinding; topics: DeviceTypeMqttTopic[];
    onChange: (binding: WidgetStateBinding) => void; includePath?: boolean;
}) {
    const topic = topics.find((topic) => topic.key === binding.topicKey)?.topic || "";
    return (
        <fieldset>
            <legend>{label}</legend>
            <label>Topic
                <select value={binding.topicKey} onChange={(event) => {
                    const { topicSuffix, ...next } = binding;
                    onChange({ ...next, topicKey: event.target.value });
                }}>
                    <option value="">Select topic...</option>
                    {topics.map((topic) => <option key={topic.key} value={topic.key}>{topic.label || topic.key} ({topic.action})</option>)}
                </select>
            </label>
            {topic.endsWith("/#") && <label>Topic suffix
                <input type="text" required maxLength={4096} placeholder="e.g. relay/set" value={binding.topicSuffix || ""}
                    onChange={(event) => onChange({ ...binding, topicSuffix: event.target.value })} />

            </label>}
            {topic.endsWith("/#") && <code className="mqtt-topic-template">{topic.slice(0, -1) + (binding.topicSuffix || "…")}</code>}
            {includePath && <label>JSON pointer
                <input type="text" placeholder="/value" value={binding.path || ""}
                    onChange={(event) => onChange({ ...binding, path: event.target.value || undefined })} />
            </label>}
        </fieldset>
    );
}

function PayloadField({ widget, onChange, onValidationError }: {
    widget: ButtonWidget; onChange: (widget: ButtonWidget) => void; onValidationError: Props["onValidationError"];
}) {
    const [draft, setDraft] = useState(widget.command.mode === "payload" ? JSON.stringify(widget.command.payload, null, 2) : "{}");
    return <label>JSON payload
        <textarea value={draft} rows={5} onChange={(event) => {
            setDraft(event.target.value);
            try {
                const payload: unknown = JSON.parse(event.target.value);
                if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload must be an object");
                onChange({ ...widget, command: { topicKey: widget.command.topicKey, topicSuffix: widget.command.topicSuffix, mode: "payload", payload: payload as Record<string, DashboardWidgetValue> } });
                onValidationError(undefined);
            } catch {
                onValidationError(`Widget ${widget.label}: enter a valid JSON payload object`);
            }
        }} />
    </label>;
}

export default function WidgetDefinitionEditor({ widget, topics, onChange, onKindChange, onValidationError }: Props) {
    const commandTopics = topics.filter((topic) => topic.action !== "publish");
    const stateFields = widget.state ? <BindingFields label="State to read" binding={widget.state} topics={topics} onChange={(state) => {
        if (widget.kind === "switch" && widget.state) onChange({ ...widget, state: { ...state, onValue: widget.state.onValue, offValue: widget.state.offValue } });
        else if (widget.kind !== "switch") onChange({ ...widget, state });
    }} /> : null;
    return <>
        <div className="widget-editor-identity">
            <label>Label<input type="text" value={widget.label} onChange={(event) => onChange({ ...widget, label: event.target.value })} /></label>
            <label>Widget type<select value={widget.kind} onChange={(event) => onKindChange(event.target.value as DeviceWidgetKind)}>
                {Object.values(WIDGET_TYPES).map((type) => <option key={type.kind} value={type.kind}>{type.label}</option>)}
            </select></label>
        </div>
        <div className="widget-editor-sections">
            <div className="widget-editor-section">
                {widget.kind !== "text" && widget.kind !== "value" && (
                    <label className="widget-feedback-toggle">
                        <input type="checkbox" checked={Boolean(widget.state)} onChange={(event) => {
                            if (event.target.checked) {
                                const state = { topicKey: topics.find((topic) => topic.key === "telemetry")?.key || topics.find((topic) => topic.action !== "subscribe" && topic.key !== "availability")?.key || topics[0]?.key || "" };
                                if (widget.kind === "switch") onChange({ ...widget, state: { ...state, onValue: true, offValue: false } });
                                else onChange({ ...widget, state });
                            } else {
                                const { state, ...next } = widget;
                                onChange(next);
                            }
                        }} /> Read feedback from the device
                    </label>
                )}
                {stateFields}
                {widget.kind === "switch" && widget.state && <>
                    <WidgetScalarField label="State value for ON" value={widget.state.onValue}
                        onChange={(onValue) => onChange({ ...widget, state: { ...widget.state!, onValue } })} />
                    <WidgetScalarField label="State value for OFF" value={widget.state.offValue}
                        onChange={(offValue) => onChange({ ...widget, state: { ...widget.state!, offValue } })} />
                </>}
            </div>
            {"command" in widget && <div className="widget-editor-section">
                <BindingFields label="Command to send" binding={widget.command} topics={commandTopics}
                    includePath={!(widget.kind === "button" && widget.command.mode === "payload")}
                    onChange={(binding) => onChange(withCommandBinding(widget, binding))} />
                {widget.kind === "button" && <>
                    <label>Command format<select value={widget.command.mode} onChange={(event) => {
                        onValidationError(undefined);
                        onChange({ ...widget, command: event.target.value === "payload"
                            ? { topicKey: widget.command.topicKey, topicSuffix: widget.command.topicSuffix, mode: "payload", payload: {} }
                            : { topicKey: widget.command.topicKey, topicSuffix: widget.command.topicSuffix, mode: "value", value: "" } });
                    }}>
                        <option value="value">Single value</option><option value="payload">JSON payload</option>
                    </select></label>
                    {widget.command.mode === "value"
                        ? <WidgetScalarField key="command-value" label="Value to send" value={widget.command.value}
                            onChange={(value) => onChange({ ...widget, command: { ...widget.command, mode: "value", value } })} />
                        : <PayloadField widget={widget} onChange={onChange} onValidationError={onValidationError} />}
                </>}
                {widget.kind === "switch" && <>
                    <WidgetScalarField label="Command value for ON" value={widget.command.onValue}
                        onChange={(onValue) => onChange({ ...widget, command: { ...widget.command, onValue } })} />
                    <WidgetScalarField label="Command value for OFF" value={widget.command.offValue}
                        onChange={(offValue) => onChange({ ...widget, command: { ...widget.command, offValue } })} />
                </>}
                {widget.kind === "input" && <>
                    <label>Input value type<select value={widget.command.valueType} onChange={(event) => {
                        const valueType = event.target.value as "string" | "number" | "boolean";
                        onChange({ ...widget, command: { topicKey: widget.command.topicKey, topicSuffix: widget.command.topicSuffix, path: widget.command.path, valueType } });
                    }}><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option></select></label>
                    {widget.command.valueType === "number" && (["min", "max"] as const).map((key) => <label key={key}>
                        {key === "min" ? "Minimum" : "Maximum"}
                        <input type="number" step="any" value={widget.command.valueType === "number" ? widget.command[key] ?? "" : ""}
                            onChange={(event) => {
                                if (widget.command.valueType !== "number") return;
                                const command = { ...widget.command };
                                if (event.target.value === "") delete command[key]; else command[key] = Number(event.target.value);
                                onChange({ ...widget, command });
                            }} />
                    </label>)}
                </>}
            </div>}
        </div>
    </>;
}
