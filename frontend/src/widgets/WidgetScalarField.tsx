import { useState } from "react";
import { DashboardWidgetValue } from "@shared/widgets";

type Props = { label: string; value: DashboardWidgetValue; onChange: (value: DashboardWidgetValue) => void };

export default function WidgetScalarField({ label, value, onChange }: Props) {
    const valueType = typeof value;
    const [draft, setDraft] = useState(String(value));
    return (
        <fieldset className="widget-scalar-field">
            <legend>{label}</legend>
            <label>
                Type
                <select value={valueType} onChange={(event) => {
                    const next = event.target.value === "number" ? 0 : event.target.value === "boolean" ? false : "";
                    setDraft(String(next));
                    onChange(next);
                }}>
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                </select>
            </label>
            <label>
                Value
                {valueType === "boolean" ? (
                    <select value={String(value)} onChange={(event) => onChange(event.target.value === "true")}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                    </select>
                ) : (
                    <input type="text" inputMode={valueType === "number" ? "decimal" : "text"}
                        value={draft} onChange={(event) => {
                            const raw = event.target.value;
                            setDraft(raw);
                            onChange(valueType === "number" ? (raw.trim() ? Number(raw) : NaN) : raw);
                        }} />
                )}
            </label>
        </fieldset>
    );
}
