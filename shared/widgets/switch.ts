import { DashboardWidgetValue, ResolvedWidgetState, WidgetCommandBinding, WidgetIdentity, WidgetStateBinding, WidgetRuntimeBase } from "./base";

import { WidgetValidationError, widgetBinding, widgetKeys, widgetObject, widgetScalar, widgetSource } from "./validationFields";

export interface SwitchValues {
    onValue: DashboardWidgetValue;
    offValue: DashboardWidgetValue;
}

export interface SwitchWidget extends WidgetIdentity {
    kind: "switch";
    command: WidgetCommandBinding & SwitchValues;
    state?: WidgetStateBinding & SwitchValues;
}

export interface SwitchWidgetRuntime extends WidgetRuntimeBase {
    kind: "switch";
    state?: ResolvedWidgetState & SwitchValues;
}

function parseSwitchBinding(raw: unknown, field: string): WidgetStateBinding & SwitchValues {
    const value = widgetObject(raw, field);
    widgetKeys(value, ["topicKey", "topicSuffix", "path", "onValue", "offValue"], field);
    const onValue = widgetScalar(value.onValue, `${field}.onValue`);
    const offValue = widgetScalar(value.offValue, `${field}.offValue`);
    if (onValue === offValue) throw new WidgetValidationError(field, "ON and OFF values must differ");
    return { ...widgetBinding(value, field), onValue, offValue };
}

export const switchWidget = {
    kind: "switch" as const,
    label: "Switch",
    parse(raw: unknown): SwitchWidget {
        const { source, id, label, field } = widgetSource(raw, "switch", ["command", "state"]);
        return { id, label, kind: "switch", command: parseSwitchBinding(source.command, `${field}.command`),
            ...(source.state === undefined ? {} : { state: parseSwitchBinding(source.state, `${field}.state`) }) };
    },
    create(id: string): SwitchWidget {
        return { id, kind: "switch", label: "New switch", command: { topicKey: "", onValue: true, offValue: false } };
    },
};
