import { apiFetch, apiFetchFD, apiFetchWithAuth } from "../api/apiClient";
import {
    DeviceShareInvitationRow,
    DeviceShareRow,
    DeviceWithRelations,
} from "@shared/types/device";
import { DeviceType } from "@shared/types/device_type";
import { MqttAclRule } from "@shared/types/mqtt";
import { MqttAclAction, MqttAclPermission } from "@shared/constants/mqtt";

const DT_URL = "/device-types";

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

export async function createDevice(payload: {
    code: string;
    device_type_id: string;
    owner_id?: number | null;
    owner_email?: string;
    activated?: boolean;
}) {
    return apiFetchWithAuth<DeviceWithRelations>("/devices", {
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
    payload: { email: string; canWrite?: boolean }
) {
    return apiFetchWithAuth<{
        ok: boolean;
        mode: "shared" | "invited";
        deviceCode: string;
        email: string;
        canWrite: number;
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

export async function upsertMqttAclRule(
    deviceCode: string,
    payload: {
        id?: number;
        action: MqttAclAction;
        topicPattern: string;
        permission: MqttAclPermission;
        priority: number;
    }
) {
    return apiFetchWithAuth<{ ok: boolean; id: number }>(`/mqtt/admin/acl/${encodeURIComponent(deviceCode)}`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function deleteMqttAclRule(id: number) {
    return apiFetchWithAuth<{ ok: boolean }>(`/mqtt/admin/acl/rules/${id}`, {
        method: "DELETE",
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
