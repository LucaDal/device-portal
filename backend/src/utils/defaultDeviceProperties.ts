import {
    PropertyType,
    SavedProperties,
    castPropertyValue,
    isPropertyType,
} from "@shared/types/properties";

export type DefaultPropertyRow = {
    key: string;
    label?: string | null;
    type: PropertyType;
    value: string;
    is_global?: number | boolean | null;
};

function cleanLabel(value: unknown): string {
    return String(value || "").trim();
}

function defaultPropertyFromRow(row: DefaultPropertyRow) {
    const cast = castPropertyValue(row.type, row.value, row.key);
    if (!cast.ok) return null;

    const label = cleanLabel(row.label);
    return {
        type: row.type,
        value: cast.value,
        ...(label ? { label } : {}),
        global: Boolean(row.is_global),
    };
}

export function rowsToDefaultProperties(rows: DefaultPropertyRow[]): SavedProperties {
    const out: SavedProperties = {};
    for (const row of rows) {
        const property = defaultPropertyFromRow(row);
        if (property) out[row.key] = property;
    }
    return out;
}

export function parseDefaultPropertiesInput(
    raw: unknown
): { ok: true; properties: SavedProperties } | { ok: false; error: string } {
    const obj = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : null;
    if (!obj) return { ok: false, error: "properties is not a valid object" };

    const properties: SavedProperties = {};
    for (const [rawKey, entry] of Object.entries(obj)) {
        const key = rawKey.trim();
        if (!key) continue;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return { ok: false, error: `Invalid property "${key}".` };
        }

        const type = (entry as any).type;
        if (!isPropertyType(type)) {
            return { ok: false, error: `Invalid type for "${key}".` };
        }

        const cast = castPropertyValue(type, (entry as any).value, key);
        if (!cast.ok) return cast;

        const label = cleanLabel((entry as any).label);
        properties[key] = {
            type,
            value: cast.value,
            ...(label ? { label } : {}),
            global: Boolean((entry as any).global),
        };
    }

    return { ok: true, properties };
}
