import { WidgetIdentity, WidgetStateBinding, WidgetRuntimeBase } from "./base";

import { widgetSource, widgetState } from "./validationFields";

export interface ValueWidget extends WidgetIdentity {
    kind: "value";
    state: WidgetStateBinding;
}

export interface ValueWidgetRuntime extends WidgetRuntimeBase {
    kind: "value";
}

export const valueWidget = {
    kind: "value" as const,
    label: "Value",
    parse(raw: unknown): ValueWidget {
        const { source, id, label, field } = widgetSource(raw, "value", ["state"]);
        return { id, label, kind: "value", state: widgetState(source.state, `${field}.state`) };
    },
    create(id: string): ValueWidget {
        return { id, kind: "value", label: "New value", state: { topicKey: "" } };
    },
};
