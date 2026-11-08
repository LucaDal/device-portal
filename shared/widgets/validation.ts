import { WidgetStateBinding } from "./base";
import { DeviceDashboardWidget } from "./types";
import { WIDGET_TYPES } from "./definitions";
import { WidgetValidationError, widgetObject } from "./validationFields";
import type { DeviceTypeMqttTopic } from "../types/device_type_mqtt";
export { WidgetValidationError } from "./validationFields";

export function parseDeviceDashboardWidget(raw: unknown): DeviceDashboardWidget {
    const source = widgetObject(raw, "widget");
    const definition = Object.values(WIDGET_TYPES).find((type) => type.kind === source.kind);
    if (!definition) throw new WidgetValidationError("widget.kind", "is unknown");
    return definition.parse(source);
}

export function resolveWidgetTopic(binding: WidgetStateBinding, topic: string, field = "widget.topic"): string {
    if (!topic) throw new WidgetValidationError(field, "topic is unavailable");
    let resolved = topic;
    if (topic.endsWith("/#")) {
        if (!binding.topicSuffix) throw new WidgetValidationError(`${field}.topicSuffix`, "is required for a topic ending in /#");
        resolved = topic.slice(0, -1) + binding.topicSuffix;
    } else if (binding.topicSuffix !== undefined) {
        throw new WidgetValidationError(`${field}.topicSuffix`, "is only allowed for a topic ending in /#");
    }
    if (new TextEncoder().encode(resolved).length > 65535) throw new WidgetValidationError(field, "topic exceeds the MQTT byte limit");
    return resolved;
}

export function validateWidgetTopics(widget: DeviceDashboardWidget, topics: DeviceTypeMqttTopic[]): void {
    for (const [name, binding] of [["state", widget.state], ["command", "command" in widget ? widget.command : undefined]] as const) {
        if (!binding) continue;
        const field = `Widget ${widget.id}.${name}`;
        const topic = topics.find((topic) => topic.key === binding.topicKey);
        if (!topic) throw new WidgetValidationError(`${field}.topicKey`, "references an unknown topic");
        if (name === "command" && topic.action === "publish") throw new WidgetValidationError(`${field}.topicKey`, "must use a topic the device subscribes to");
        resolveWidgetTopic(binding, topic.topic || "", field);
    }
}

export function parseDeviceDashboardWidgets(raw: unknown, topics?: DeviceTypeMqttTopic[]): DeviceDashboardWidget[] {
    if (!Array.isArray(raw)) throw new WidgetValidationError("widgets", "must be an array");
    const seen = new Set<string>();
    return raw.map((item) => {
        const widget = parseDeviceDashboardWidget(item);
        if (seen.has(widget.id)) throw new WidgetValidationError(`Widget ${widget.id}.id`, "is duplicated");
        seen.add(widget.id);
        if (topics) validateWidgetTopics(widget, topics);
        return widget;
    });
}
