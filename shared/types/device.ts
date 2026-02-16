import { DeviceType } from "./device_type";

export interface Device {
  code: string;
  type_id: string;
  owner_id: number | null;
  owner_email?: string | null;
}

export interface DeviceWithRelations {
    code: string;
    device_type_id: string;
    owner_id?: number | null;
    owner_email?: string | null;
    activated: number; // 0/1
    is_shared?: number;
    can_write?: number;

    device_type_description?: string | null;
    firmware_version?: string;
    type_properties?: string | Record<string, unknown> | null;
    device_properties?: string | Record<string, unknown> | null;
}

export interface DeviceShareRow {
    device_code: string;
    user_id: number;
    can_write: number;
    shared_by: number;
    created_at: string;
    user_email: string;
    shared_by_email?: string | null;
}

export interface DeviceShareInvitationRow {
    id: number;
    device_code: string;
    email: string;
    can_write: number;
    invited_by: number;
    expires_at: string;
    accepted_at?: string | null;
    created_at: string;
    invited_by_email?: string | null;
}
