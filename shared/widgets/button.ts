import { DashboardWidgetValue, WidgetCommandBinding, WidgetIdentity, WidgetStateBinding, WidgetRuntimeBase } from "./base";

import { WidgetValidationError, widgetBinding, widgetKeys, widgetObject, widgetScalar, widgetSource, widgetState } from "./validationFields";

export type ButtonCommand =
    | (WidgetCommandBinding & { mode: "value"; value: DashboardWidgetValue })
    | (Pick<WidgetCommandBinding, "topicKey" | "topicSuffix"> & { mode: "payload"; payload: Record<string, DashboardWidgetValue> });

export interface ButtonWidget extends WidgetIdentity {
    kind: "button";
    command: ButtonCommand;
    state?: WidgetStateBinding;
}

export interface ButtonWidgetRuntime extends WidgetRuntimeBase {
    kind: "button";
}

export const buttonWidget = {
    kind: "button" as const,
    label: "Button",
    parse(raw: unknown): ButtonWidget {
        const { source, id, label, field } = widgetSource(raw, "button", ["command", "state"]);
        const state = source.state === undefined ? {} : { state: widgetState(source.state, `${field}.state`) };
        const command = widgetObject(source.command, `${field}.command`);
        const binding = widgetBinding(command, `${field}.command`);
        if (command.mode === "value") {
            widgetKeys(command, ["topicKey", "topicSuffix", "path", "mode", "value"], `${field}.command`);
            return { id, label, kind: "button", ...state, command: { ...binding, mode: "value", value: widgetScalar(command.value, `${field}.command.value`) } };
        }
        if (command.mode === "payload") {
            widgetKeys(command, ["topicKey", "topicSuffix", "mode", "payload"], `${field}.command`);
            const payload = widgetObject(command.payload, `${field}.command.payload`);
            for (const [key, value] of Object.entries(payload)) widgetScalar(value, `${field}.command.payload.${key}`);
            return { id, label, kind: "button", ...state, command: { ...binding, mode: "payload", payload: payload as Record<string, DashboardWidgetValue> } };
        }
        throw new WidgetValidationError(`${field}.command.mode`, "must be value or payload");
    },
    create(id: string): ButtonWidget {
        return { id, kind: "button", label: "New button", command: { topicKey: "", mode: "value", value: "" } };
    },
};
