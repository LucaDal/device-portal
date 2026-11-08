import { apiFetchFD, apiFetchWithAuth } from "../api/apiClient";
import {
    DeviceCreationResult,
    DeviceCreateInput,
    DeviceShareInvitationRow,
    DeviceShareRow,
    DeviceWithRelations,
} from "@shared/types/device";
import { DeviceType } from "@shared/types/device_type";
import { MqttAclRule } from "@shared/types/mqtt";
import { MqttPublishInput } from "@shared/types/mqtt_publish";
import {
    DEVICE_WIDGET_SCHEMA_VERSION,
    DeviceDashboardWidgetActionInput,
    DeviceDashboardWidget,
    DeviceDashboardWidgetsResponse,
    DeviceTypeWidgetsResponse,
} from "@shared/widgets";

const DT_URL = "/device-types";

function currentDashboard<T extends { schemaVersion: number }>(response: T): T {
    if (response.schemaVersion !== DEVICE_WIDGET_SCHEMA_VERSION) throw new Error("Unsupported widget format. Update the API and reload the dashboard.");
    return response;
}


export const getDeviceTypes = async (): Promise<DeviceType[]> => {
    return apiFetchWithAuth<DeviceType[]>(`${DT_URL}`, {
        method: "GET"
    });
};

export const updateDeviceType = async (url: string, method: string, formData?: FormData | null): Promise<Response> => {
    return apiFetchFD(`${DT_URL}${url}`,method, formData);
};


export async function getDevices(): Promise<DeviceWithRelations[]> {
    return apiFetchWithAuth<DeviceWithRelations[]>("/devices", {method : "GET"});
}

export async function setDeviceMqttEnabled(code: string, enabled: boolean) {
    return apiFetchWithAuth<{ mqtt_enabled: number; mqtt_available: boolean }>(
        `/devices/${encodeURIComponent(code)}/mqtt`,
        { method: "PUT", body: JSON.stringify({ mqtt_enabled: enabled }) }
    );
}

export async function getDeviceDashboardWidgets(
    code: string
): Promise<DeviceDashboardWidgetsResponse> {
    return currentDashboard(await apiFetchWithAuth<DeviceDashboardWidgetsResponse>(
        `/devices/${encodeURIComponent(code)}/widgets`,
        { method: "GET" }
    ));
}

export async function getDeviceTypeWidgets(id: string): Promise<DeviceTypeWidgetsResponse> {
    return currentDashboard(await apiFetchWithAuth<DeviceTypeWidgetsResponse>(
        `${DT_URL}/${encodeURIComponent(id)}/widgets`, { method: "GET" }
    ));
}

export async function updateDeviceTypeWidgets(
    id: string,
    widgets: DeviceDashboardWidget[],
    revision: number
): Promise<DeviceTypeWidgetsResponse> {
    return currentDashboard(await apiFetchWithAuth<DeviceTypeWidgetsResponse>(
        `${DT_URL}/${encodeURIComponent(id)}/widgets`,
        { method: "PUT", body: JSON.stringify({ widgets, revision }) }
    ));
}

export async function runDeviceDashboardWidgetAction(
    code: string,
    widgetId: string,
    input: DeviceDashboardWidgetActionInput = {}
) {
    return apiFetchWithAuth<{ ok: boolean; widgetId: string; status: "published" }>(
        `/devices/${encodeURIComponent(code)}/widgets/${encodeURIComponent(widgetId)}/action`,
        {
            method: "POST",
            body: JSON.stringify(input),
        }
    );
}

export async function createDevice(payload: DeviceCreateInput) {
    return apiFetchWithAuth<DeviceCreationResult>("/devices", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function updateDeviceProperties(
    code: string,
    properties: Record<string, unknown>
) {
    return apiFetchWithAuth<{ ok: boolean }>(`/devices/${encodeURIComponent(code)}/properties`, {
        method: "PUT",
        body: JSON.stringify({ properties }),
    });
}

export async function registerDeviceByCode(code: string) {
    return apiFetchWithAuth<{ ok: boolean}>("/devices/register", {
        method: "POST",
        body: JSON.stringify({ code }),
    });
}

export async function deleteDevice(code: string) {
    return apiFetchWithAuth<{ ok: boolean}>(`/devices/${code}`, {
        method: "DELETE",
    });
}

export async function getDeviceShares(deviceCode: string) {
    return apiFetchWithAuth<{ shares: DeviceShareRow[]; invitations: DeviceShareInvitationRow[] }>(
        `/devices/${encodeURIComponent(deviceCode)}/shares`,
        { method: "GET" }
    );
}

export async function shareDeviceByEmail(
    deviceCode: string,
    payload: { email: string }
) {
    return apiFetchWithAuth<{
        ok: boolean;
        mode: "shared" | "invited";
        deviceCode: string;
        email: string;
        userId?: number;
        expiresAt?: string;
    }>(`/devices/${encodeURIComponent(deviceCode)}/shares`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function removeDeviceShare(deviceCode: string, userId: number) {
    return apiFetchWithAuth<{ ok: boolean }>(
        `/devices/${encodeURIComponent(deviceCode)}/shares/user/${userId}`,
        { method: "DELETE" }
    );
}

export async function revokeDeviceShareInvitation(deviceCode: string, invitationId: number) {
    return apiFetchWithAuth<{ ok: boolean }>(
        `/devices/${encodeURIComponent(deviceCode)}/shares/invitations/${invitationId}`,
        { method: "DELETE" }
    );
}

export async function getMqttAclRules(deviceCode: string): Promise<MqttAclRule[]> {
    return apiFetchWithAuth<MqttAclRule[]>(`/mqtt/admin/acl/${encodeURIComponent(deviceCode)}`, {
        method: "GET",
    });
}

export async function publishMqttWithSession(payload: MqttPublishInput) {
    return apiFetchWithAuth<{ ok: boolean; topic: string; broker: string }>("/mqtt/session-publish", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function revokeDeviceOwnership(payload: { deviceCode: string; ownerEmail: string }) {
    return apiFetchWithAuth<{ ok: boolean; deviceCode: string; ownerEmail: string }>(
        "/manage/devices/revoke-ownership",
        {
            method: "POST",
            body: JSON.stringify(payload),
        }
    );
}
