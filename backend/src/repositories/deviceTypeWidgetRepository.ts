import { and, eq, sql } from "drizzle-orm";
import { db } from "../config/database";
import { devices, deviceTypes, deviceTypeWidgets } from "../db/schema";
import { DeviceDashboardWidget, parseDeviceDashboardWidget } from "@shared/widgets";

export class WidgetConfigurationConflictError extends Error {
    constructor() { super("Device type widget configuration changed. Reload it before saving again."); }
}

export function loadDeviceTypeWidgets(deviceTypeId: string): DeviceDashboardWidget[] {
    return db.select({ definition: deviceTypeWidgets.definition }).from(deviceTypeWidgets)
        .where(eq(deviceTypeWidgets.device_type_id, deviceTypeId))
        .orderBy(deviceTypeWidgets.position, deviceTypeWidgets.widget_id).all()
        .map((row) => parseDeviceDashboardWidget(row.definition));
}

export function loadDeviceWidgets(deviceCode: string): DeviceDashboardWidget[] {
    return db.select({ definition: deviceTypeWidgets.definition }).from(deviceTypeWidgets)
        .innerJoin(devices, eq(devices.device_type_id, deviceTypeWidgets.device_type_id))
        .where(eq(devices.code, deviceCode))
        .orderBy(deviceTypeWidgets.position, deviceTypeWidgets.widget_id).all()
        .map((row) => parseDeviceDashboardWidget(row.definition));
}

export function replaceDeviceTypeWidgets(deviceTypeId: string, widgets: DeviceDashboardWidget[], expectedRevision: number) {
    db.transaction(() => {
        const changed = db.update(deviceTypes).set({ widgets_revision: sql`${deviceTypes.widgets_revision} + 1` })
            .where(and(eq(deviceTypes.id, deviceTypeId), eq(deviceTypes.widgets_revision, expectedRevision))).run();
        if (!changed.changes) throw new WidgetConfigurationConflictError();
        db.delete(deviceTypeWidgets).where(eq(deviceTypeWidgets.device_type_id, deviceTypeId)).run();
        if (widgets.length) {
            db.insert(deviceTypeWidgets).values(widgets.map((widget, position) => ({
                device_type_id: deviceTypeId, widget_id: widget.id, position, definition: widget,
            }))).run();
        }
    });
}
