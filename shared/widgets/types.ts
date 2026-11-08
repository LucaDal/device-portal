import { DEVICE_WIDGET_SCHEMA_VERSION, DashboardWidgetValue } from "./base";
import { TextWidget, TextWidgetRuntime } from "./text";
import { ValueWidget, ValueWidgetRuntime } from "./value";
import { SwitchWidget, SwitchWidgetRuntime } from "./switch";
import { ButtonWidget, ButtonWidgetRuntime } from "./button";
import { InputWidget, InputWidgetRuntime } from "./input";
import type { DeviceTypeMqttTopic } from "../types/device_type_mqtt";

export type DeviceDashboardWidget = TextWidget | ValueWidget | SwitchWidget | ButtonWidget | InputWidget;
export type DeviceWidgetKind = DeviceDashboardWidget["kind"];
export type DeviceDashboardWidgetRuntime = TextWidgetRuntime | ValueWidgetRuntime | SwitchWidgetRuntime | ButtonWidgetRuntime | InputWidgetRuntime;

export interface DeviceTypeWidgetConfiguration {
    revision: number;
    topics: DeviceTypeMqttTopic[];
    widgets: DeviceDashboardWidget[];
}

export interface DeviceDashboardWidgetsResponse {
    schemaVersion: typeof DEVICE_WIDGET_SCHEMA_VERSION;
    deviceCode: string;
    deviceTypeId: string;
    canConfigure: false;
    widgets: DeviceDashboardWidgetRuntime[];
}

export interface DeviceTypeWidgetsResponse {
    schemaVersion: typeof DEVICE_WIDGET_SCHEMA_VERSION;
    deviceTypeId: string;
    configuration: DeviceTypeWidgetConfiguration;
}

export type DeviceDashboardWidgetActionInput = { state?: boolean; value?: DashboardWidgetValue };
