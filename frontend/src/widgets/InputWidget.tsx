import { useState } from "react";
import { InputWidgetRuntime, parseWidgetInput } from "@shared/widgets";
import WidgetFrame, { WidgetViewProps } from "./WidgetFrame";
import { useWidgetAction } from "./useWidgetAction";

export default function InputWidgetView(props: WidgetViewProps<InputWidgetRuntime>) {
    const { widget } = props;
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const action = useWidgetAction(props.deviceCode, widget.id, props.observation, props.connected);
    function send() {
        try {
            const value = parseWidgetInput(draft, widget.input);
            setError("");
            void action.send({ value }, widget.state ? value : undefined);
        } catch (error) { setError(error instanceof Error ? error.message : "Invalid value"); }
    }
    return <WidgetFrame {...props} message={error || action.message} failed={Boolean(error) || action.failed}>
        <div className="home-input-widget">
            {widget.input.valueType === "boolean" ? <select aria-label={widget.label} value={draft} disabled={action.busy || !widget.configured} onChange={(event) => { setDraft(event.target.value); setError(""); }}>
                <option value="">Select value...</option><option value="true">true</option><option value="false">false</option>
            </select> : <input type="text" inputMode={widget.input.valueType === "number" ? "decimal" : "text"}
                aria-label={widget.label} value={draft} disabled={action.busy || !widget.configured}
                onChange={(event) => { setDraft(event.target.value); setError(""); }} />}
            <button type="button" className="home-action-button" disabled={action.busy || !widget.configured} onClick={send}>{action.busy ? "Sending..." : "Send"}</button>
        </div>
    </WidgetFrame>;
}
