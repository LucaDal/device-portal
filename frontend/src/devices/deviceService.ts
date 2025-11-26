import { apiFetchWithAuth } from "../api/apiClient";
import { DevicePayload, Device } from "@shared/types/device";
import { DeviceType } from "@shared/types/device_type";

export async function getDevices(): Promise<Device[]> {
  return apiFetchWithAuth<Device[]>("/devices", {
    method: "GET",
  });
}

export const getDeviceTypes = async (): Promise<DeviceType[]> => {
  return apiFetchWithAuth<DeviceType[]>("/device-types", {
    method: "GET"
  });
};

export async function addDevice(device: DevicePayload): Promise<{ id: number }> {
  return apiFetchWithAuth<{ id: number }>("/devices", {
    method: "POST",
    body: JSON.stringify(device)
  });
}
export const addDeviceType = async (desc: string): Promise<DeviceType> => {
  return await apiFetchWithAuth<DeviceType>("/device-types", {
    method: "POST",
    body: JSON.stringify({description: desc})
  });
};
