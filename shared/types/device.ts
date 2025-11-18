import { DeviceType } from "./device_type";

export interface Device {
  id: string;
  type: DeviceType;
  owner_id: number | null;
  firmware_version: string;
  firmware_build: File | null;
  activated: boolean;
}
export interface DevicePayload {
  type_id: number;
  owner_id: number | null;
  firmware_version: string;
  firmware_build: File | null;
}
