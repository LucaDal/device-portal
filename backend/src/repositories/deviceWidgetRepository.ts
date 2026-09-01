import { DB } from "../config/database";
import {
    DashboardWidgetValue,
    DeviceDashboardWidget,
    isDashboardWidgetValue,
    parseDeviceDashboardWidgets,
} from "@shared/types/device_type_mqtt";

type DeviceWidgetRow = {
    widget_id: string;
    label: string;
    kind: string;
    topic_key: string;
    state_topic_key: string | null;
    state_value_path: string | null;
    publish_value: string | null;
    on_value: string | null;
    off_value: string | null;
    payload: string | null;
};

function serializeValue(value: DashboardWidgetValue | undefined): string | null {
    return typeof value === "undefined" ? null : JSON.stringify(value);
}

function deserializeValue(raw: string | null): DashboardWidgetValue | undefined {
    if (raw === null) return undefined;
    try {
        const value = JSON.parse(raw);
        return isDashboardWidgetValue(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

function mapRow(row: DeviceWidgetRow): DeviceDashboardWidget | undefined {
    const parsed = parseDeviceDashboardWidgets([{
        id: row.widget_id,
        label: row.label,
        kind: row.kind,
        topicKey: row.topic_key,
        stateTopicKey: row.state_topic_key,
        stateValuePath: row.state_value_path,
        publishValue: deserializeValue(row.publish_value),
        onValue: deserializeValue(row.on_value),
        offValue: deserializeValue(row.off_value),
        payload: row.payload ? JSON.parse(row.payload) : undefined,
    }]);
    return parsed[0];
}

function insertWidget(deviceCode: string, widget: DeviceDashboardWidget, position: number) {
    DB.prepare(`
        INSERT INTO device_widgets (
            device_code,
            widget_id,
            label,
            kind,
            topic_key,
            position,
            state_topic_key,
            state_value_path,
            publish_value,
            on_value,
            off_value,
            payload,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        deviceCode,
        widget.id,
        widget.label,
        widget.kind,
        widget.topicKey,
        position,
        widget.stateTopicKey || null,
        widget.stateValuePath || null,
        serializeValue(widget.publishValue),
        serializeValue(widget.onValue),
        serializeValue(widget.offValue),
        widget.payload ? JSON.stringify(widget.payload) : null
    );
}

export function loadDeviceWidgets(deviceCode: string): DeviceDashboardWidget[] {
    const rows = DB.prepare(`
        SELECT
            widget_id,
            label,
            kind,
            topic_key,
            state_topic_key,
            state_value_path,
            publish_value,
            on_value,
            off_value,
            payload
        FROM device_widgets
        WHERE device_code = ?
        ORDER BY position ASC, widget_id ASC
    `).all(deviceCode) as DeviceWidgetRow[];
    return rows.flatMap((row) => {
        try {
            const widget = mapRow(row);
            return widget ? [widget] : [];
        } catch {
            return [];
        }
    });
}

export function replaceDeviceWidgets(deviceCode: string, widgets: DeviceDashboardWidget[]) {
    DB.transaction(() => {
        DB.prepare("DELETE FROM device_widgets WHERE device_code = ?").run(deviceCode);
        for (const [position, widget] of widgets.entries()) {
            insertWidget(deviceCode, widget, position);
        }
    })();
}
