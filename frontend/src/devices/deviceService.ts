import { apiFetch, apiFetchWithAuth } from "../api/apiClient";
import { DevicePayload, Device } from "@shared/types/device";
import { DeviceType } from "@shared/types/device_type";

export async function getDevices(): Promise<Device[]> {
  return apiFetch<Device[]>("/devices", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    }
  });
}

export const getDeviceTypes = async (): Promise<DeviceType[]> => {
  return apiFetch<DeviceType[]>("/device-types", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    }
  });
};

export async function addDevice(device: DevicePayload): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/devices", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    },
    body: JSON.stringify(device)
  });
}
export const addDeviceType = async (desc: string): Promise<DeviceType> => {
  return await apiFetchWithAuth<DeviceType>("/device-types", {
    method: "POST",
    body: JSON.stringify({description: desc})
  });
};
