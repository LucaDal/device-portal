import { textWidget } from "./text";
import { valueWidget } from "./value";
import { switchWidget } from "./switch";
import { inputWidget } from "./input";
import { buttonWidget } from "./button";
import type { DeviceDashboardWidget, DeviceWidgetKind } from "./types";

type WidgetDefinitions = {
    [Kind in DeviceWidgetKind]: {
        kind: Kind;
        label: string;
        create(id: string): Extract<DeviceDashboardWidget, { kind: Kind }>;
        parse(raw: unknown): Extract<DeviceDashboardWidget, { kind: Kind }>;
    };
};

export const WIDGET_TYPES = {
    text: textWidget,
    value: valueWidget,
    switch: switchWidget,
    input: inputWidget,
    button: buttonWidget,
} satisfies WidgetDefinitions;
