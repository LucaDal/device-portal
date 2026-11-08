import { WidgetCommandBinding, WidgetIdentity, WidgetStateBinding, WidgetRuntimeBase } from "./base";

import { WidgetValidationError, widgetBinding, widgetKeys, widgetObject, widgetSource, widgetState } from "./validationFields";

export type WidgetInputOptions =
    | { valueType: "string" }
    | { valueType: "boolean" }
    | { valueType: "number"; min?: number; max?: number };

export interface InputWidget extends WidgetIdentity {
    kind: "input";
    command: WidgetCommandBinding & WidgetInputOptions;
    state?: WidgetStateBinding;
}

export interface InputWidgetRuntime extends WidgetRuntimeBase {
    kind: "input";
    input: WidgetInputOptions;
}

export const inputWidget = {
    kind: "input" as const,
    label: "Input",
    parse(raw: unknown): InputWidget {
        const { source, id, label, field } = widgetSource(raw, "input", ["command", "state"]);
        const state = source.state === undefined ? {} : { state: widgetState(source.state, `${field}.state`) };
        const command = widgetObject(source.command, `${field}.command`);
        const binding = widgetBinding(command, `${field}.command`);
        const valueType = command.valueType;
        if (valueType === "string" || valueType === "boolean") {
            widgetKeys(command, ["topicKey", "topicSuffix", "path", "valueType"], `${field}.command`);
            return { id, label, kind: "input", ...state, command: { ...binding, valueType } };
        }
        if (valueType === "number") {
            widgetKeys(command, ["topicKey", "topicSuffix", "path", "valueType", "min", "max"], `${field}.command`);
            for (const key of ["min", "max"] as const) {
                if (command[key] !== undefined && (typeof command[key] !== "number" || !Number.isFinite(command[key]))) throw new WidgetValidationError(`${field}.command.${key}`, "must be a finite number");
            }
            const min = command.min as number | undefined;
            const max = command.max as number | undefined;
            if (min !== undefined && max !== undefined && min > max) throw new WidgetValidationError(`${field}.command`, "minimum exceeds maximum");
            return { id, label, kind: "input", ...state, command: { ...binding, valueType,
                ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) } };
        }
        throw new WidgetValidationError(`${field}.command.valueType`, "must be string, number or boolean");
    },
    create(id: string): InputWidget {
        return { id, kind: "input", label: "New input", command: { topicKey: "", valueType: "string" } };
    },
};
