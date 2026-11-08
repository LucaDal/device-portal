import { WidgetIdentity, WidgetStateBinding, WidgetRuntimeBase } from "./base";

import { widgetSource, widgetState } from "./validationFields";

export interface TextWidget extends WidgetIdentity {
    kind: "text";
    state: WidgetStateBinding;
}

export interface TextWidgetRuntime extends WidgetRuntimeBase {
    kind: "text";
}

export const textWidget = {
    kind: "text" as const,
    label: "Text",
    parse(raw: unknown): TextWidget {
        const { source, id, label, field } = widgetSource(raw, "text", ["state"]);
        return { id, label, kind: "text", state: widgetState(source.state, `${field}.state`) };
    },
    create(id: string): TextWidget {
        return { id, kind: "text", label: "New text", state: { topicKey: "" } };
    },
};
