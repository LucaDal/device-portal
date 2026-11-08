import { DashboardWidgetValue } from "./base";
import type { WidgetInputOptions } from "./input";

export function isValidDashboardStateValuePath(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 512 &&
        value.startsWith("/") && !/~(?:[^01]|$)/.test(value);
}

function pointerSegments(path: string): string[] {
    return path.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function buildDashboardValuePayload(value: DashboardWidgetValue, path?: string): Record<string, unknown> {
    if (!path) return { value };
    if (!isValidDashboardStateValuePath(path)) throw new Error("Invalid command JSON pointer");
    let result: unknown = value;
    for (const key of pointerSegments(path).reverse()) result = { [key]: result };
    return result as Record<string, unknown>;
}

export function readDashboardStateValue(payload: unknown, path?: string): unknown {
    if (typeof payload === "string" && path) {
        try { payload = JSON.parse(payload); } catch { return undefined; }
    }
    if (!path) {
        return payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "value")
            ? (payload as { value: unknown }).value : payload;
    }
    if (!isValidDashboardStateValuePath(path)) return undefined;
    return pointerSegments(path).reduce<unknown>((value, key) => {
        if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) return undefined;
        return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key)
            ? (value as Record<string, unknown>)[key] : undefined;
    }, payload);
}

export function validateWidgetInput(value: unknown, options: WidgetInputOptions): string | undefined {
    if (typeof value !== options.valueType) return `Value must be a ${options.valueType}`;
    if (typeof value === "string" && value.length > 4096) return "Value is too long";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return "Value must be finite";
        if (options.valueType === "number") {
            if (options.min !== undefined && value < options.min) return `Minimum value is ${options.min}`;
            if (options.max !== undefined && value > options.max) return `Maximum value is ${options.max}`;
        }
    }
    return undefined;
}

export function parseWidgetInput(raw: string, options: WidgetInputOptions): DashboardWidgetValue {
    let value: DashboardWidgetValue = raw;
    if (options.valueType === "boolean") {
        if (raw !== "true" && raw !== "false") throw new Error("Select true or false");
        value = raw === "true";
    } else if (options.valueType === "number") {
        if (!raw.trim()) throw new Error("Enter a number");
        value = Number(raw);
    }
    const error = validateWidgetInput(value, options);
    if (error) throw new Error(error);
    return value;
}
