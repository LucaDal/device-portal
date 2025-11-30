import { apiFetch, apiFetchFD, apiFetchWithAuth } from "../api/apiClient";
import { DeviceWithRelations } from "@shared/types/device";
import { DeviceType } from "@shared/types/device_type";

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
