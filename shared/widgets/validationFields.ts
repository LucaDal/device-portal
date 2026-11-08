import { DashboardWidgetValue, WidgetStateBinding, isDashboardWidgetValue } from "./base";
import { isValidDashboardStateValuePath } from "./state";

type JsonObject = Record<string, unknown>;

export class WidgetValidationError extends Error {
    constructor(public readonly field: string, message: string) { super(`${field}: ${message}`); }
}

export function widgetObject(value: unknown, field: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new WidgetValidationError(field, "must be an object");
    return value as JsonObject;
}

export function widgetKeys(value: JsonObject, allowed: string[], field: string) {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) throw new WidgetValidationError(`${field}.${key}`, "is not supported for this widget");
    }
}

function requiredText(value: unknown, field: string, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > max) throw new WidgetValidationError(field, `must contain 1–${max} characters`);
    return value.trim();
}

export function widgetSource(raw: unknown, kind: string, allowed: string[]) {
    const source = widgetObject(raw, "widget");
    const id = requiredText(source.id, "widget.id", 128);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new WidgetValidationError("widget.id", "contains unsupported characters");
    const label = requiredText(source.label, `Widget ${id}.label`, 200);
    const field = `Widget "${label}"`;
    if (source.kind !== kind) throw new WidgetValidationError(`${field}.kind`, `must be ${kind}`);
    widgetKeys(source, ["id", "label", "kind", ...allowed], field);
    return { source, id, label, field };
}

export function widgetScalar(value: unknown, field: string): DashboardWidgetValue {
    if (!isDashboardWidgetValue(value)) throw new WidgetValidationError(field, "must be a string, finite number or boolean");
    return value;
}

export function widgetBinding(value: JsonObject, field: string): WidgetStateBinding {
    const topicKey = requiredText(value.topicKey, `${field}.topicKey`, 128);
    if (value.topicSuffix !== undefined && (typeof value.topicSuffix !== "string" || !value.topicSuffix.trim() ||
        value.topicSuffix.length > 4096 || /[+#\u0000{}]/.test(value.topicSuffix) ||
        value.topicSuffix.split("/").some((part) => !part.trim()))) {
        throw new WidgetValidationError(`${field}.topicSuffix`, "must be a relative topic without wildcards or empty levels");
    }
    if (value.path !== undefined && !isValidDashboardStateValuePath(value.path)) throw new WidgetValidationError(`${field}.path`, "must be a valid JSON pointer, for example /state");
    return { topicKey, ...(value.topicSuffix === undefined ? {} : { topicSuffix: value.topicSuffix as string }), ...(value.path === undefined ? {} : { path: value.path as string }) };
}

export function widgetState(value: unknown, field: string): WidgetStateBinding {
    const state = widgetObject(value, field);
    widgetKeys(state, ["topicKey", "topicSuffix", "path"], field);
    return widgetBinding(state, field);
}
