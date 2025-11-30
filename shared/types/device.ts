import { DeviceType } from "./device_type";

export interface Device {
  code: string;
  type_id: string;
  owner_id: number | null;
}

export interface DeviceWithRelations {
    code: string;
    device_type_id: number;
    owner_id?: number | null;
    activated: number; // 0/1

    device_type_description?: string | null;
    firmware_version?: string;
    type_properties?: string | Record<string, unknown> | null;
    device_properties?: string | Record<string, unknown> | null;
}

