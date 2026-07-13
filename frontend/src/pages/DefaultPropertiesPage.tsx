import { useEffect, useState } from "react";
import {
    PropertyType,
    SavedProperties,
    castPropertyValue,
    parseSavedPropertyMap,
} from "@shared/types/properties";
import { getDefaultProperties, updateDefaultProperties } from "../admin/adminService";
import ErrorBanner from "../components/ErrorBanner";
import "../style/DeviceTypesPage.css";

type DefaultPropertyRow = {
    key: string;
    label: string;
    type: PropertyType;
    global: boolean;
    value: string;
};

function rowsFromProperties(raw: unknown): DefaultPropertyRow[] {
    const props = parseSavedPropertyMap(raw);
    return Object.entries(props).map(([key, entry]) => ({
        key,
        label: entry.label || "",
        type: entry.type,
        global: Boolean(entry.global),
        value: String(entry.value),
    }));
}

function buildPayload(rows: DefaultPropertyRow[]): { ok: true; properties: SavedProperties } | { ok: false; error: string } {
    const properties: SavedProperties = {};
    const seen = new Set<string>();

    for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        if (seen.has(key)) {
            return { ok: false, error: `Duplicate default property key "${key}".` };
        }
        seen.add(key);

        const cast = castPropertyValue(row.type, row.value, key);
        if (!cast.ok) return cast;
        properties[key] = {
            type: row.type,
            ...(row.label.trim() ? { label: row.label.trim() } : {}),
            global: row.global,
            value: cast.value,
        };
    }

    return { ok: true, properties };
}

export default function DefaultPropertiesPage() {
    const [rows, setRows] = useState<DefaultPropertyRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    async function loadDefaults() {
        try {
            setLoading(true);
            setError(null);
            const data = await getDefaultProperties();
            setRows(rowsFromProperties(data));
        } catch (err: any) {
            setError(err?.error || "Error loading default properties.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadDefaults();
    }, []);

    function addRow() {
        setRows((prev) => [...prev, { key: "", label: "", type: PropertyType.STRING, global: false, value: "" }]);
    }

    function updateRow(index: number, patch: Partial<DefaultPropertyRow>) {
        setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    }

    function removeRow(index: number) {
        const key = rows[index]?.key || "this default property";
        if (!window.confirm(`Remove "${key}" from default properties?`)) return;
        setRows((prev) => prev.filter((_, i) => i !== index));
    }

    async function saveDefaults() {
        setError(null);
        setSuccessMessage(null);
        const payload = buildPayload(rows);
        if (!payload.ok) {
            setError(payload.error);
            return;
        }

        try {
            setSaving(true);
            const result = await updateDefaultProperties(payload.properties);
            setRows(rowsFromProperties(result.properties));
            setSuccessMessage("Default properties saved.");
        } catch (err: any) {
            setError(err?.error || "Error saving default properties.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="device-types-page">
            <header className="dt-header">
                <h1>Default Properties</h1>
                <p>Manage reusable default property values for admin workflows.</p>
            </header>

            <section className="dt-card dt-form-card">
                <div className="dt-form-header">
                    <h2>Default property catalog</h2>
                    <div className="dt-form-header-actions">
                        <button type="button" className="dt-btn dt-btn-outline" onClick={loadDefaults}>
                            Refresh
                        </button>
                        <button type="button" className="dt-btn dt-btn-primary" onClick={saveDefaults} disabled={saving}>
                            {saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <p className="dt-loading">Loading...</p>
                ) : (
                    <div className="dt-form dt-properties-form">
                        {rows.length === 0 && <p className="dt-empty">No default properties. Add one.</p>}

                        {rows.length > 0 && (
                            <div className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-defaults dt-prop-row-header">
                                <strong>Global</strong>
                                <strong>Type</strong>
                                <strong>Label</strong>
                                <strong>Key</strong>
                                <strong>Value</strong>
                                <strong>Action</strong>
                            </div>
                        )}

                        {rows.map((row, index) => (
                            <div
                                className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-defaults"
                                key={`default-property-${index}`}
                            >
                                <label className="dt-small dt-prop-inline-flag">
                                    <input
                                        className="dt-check"
                                        type="checkbox"
                                        checked={row.global}
                                        onChange={(e) => updateRow(index, { global: e.target.checked })}
                                    />
                                </label>
                                <select
                                    value={row.type}
                                    onChange={(e) => updateRow(index, { type: e.target.value as PropertyType })}
                                >
                                    <option value={PropertyType.STRING}>string</option>
                                    <option value={PropertyType.INT}>int</option>
                                    <option value={PropertyType.UINT}>uint</option>
                                    <option value={PropertyType.FLOAT}>float</option>
                                    <option value={PropertyType.BOOL}>bool</option>
                                </select>
                                <input
                                    type="text"
                                    value={row.label}
                                    placeholder="Readable name"
                                    onChange={(e) => updateRow(index, { label: e.target.value })}
                                />
                                <input
                                    type="text"
                                    value={row.key}
                                    placeholder="Key (e.g. maxTemp)"
                                    onChange={(e) => updateRow(index, { key: e.target.value })}
                                />
                                {row.type === PropertyType.BOOL ? (
                                    <label className="dt-small dt-prop-inline-flag">
                                        <input
                                            className="dt-check"
                                            type="checkbox"
                                            checked={row.value === "true"}
                                            onChange={(e) => updateRow(index, { value: e.target.checked ? "true" : "false" })}
                                        />
                                    </label>
                                ) : (
                                    <input
                                        type={row.type === PropertyType.STRING ? "text" : "number"}
                                        min={row.type === PropertyType.UINT ? 0 : undefined}
                                        step={row.type === PropertyType.FLOAT ? "any" : 1}
                                        value={row.value}
                                        placeholder="Value"
                                        onChange={(e) => updateRow(index, { value: e.target.value })}
                                    />
                                )}
                                <button
                                    type="button"
                                    className="dt-btn dt-btn-xs dt-btn-danger"
                                    onClick={() => removeRow(index)}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}

                        <button type="button" className="dt-btn dt-btn-xs dt-btn-outline" onClick={addRow}>
                            Add default property
                        </button>
                    </div>
                )}
            </section>

            <ErrorBanner message={error} />
            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}
        </div>
    );
}
