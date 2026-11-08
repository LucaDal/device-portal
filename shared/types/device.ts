export const DEVICE_NAME_MAX_LENGTH = 128;

export interface Device {
  name: string;
  code: string;
  type_id: string;
  owner_id: number | null;
  owner_email?: string | null;
}

export interface DeviceWithRelations {
    name: string;
    mqtt_enabled?: number;
    type_mqtt_enabled?: number;
    mqtt_available?: boolean;
    code: string;
    device_type_id: string;
    owner_id?: number | null;
    owner_email?: string | null;
    activated: number; // 0/1
    is_shared?: number;

    device_type_description?: string | null;
    firmware_version?: string;
    type_deviceProperties?: string | Record<string, unknown> | null;
    type_genericProperties?: string | Record<string, unknown> | null;
    type_mqttTopics?: string | Record<string, unknown>[] | null;
    device_properties?: string | Record<string, unknown> | null;
}

export interface DeviceCreationResult extends DeviceWithRelations {
    secret_code: string;
}

export interface DeviceCreateInput {
    name: string;
    device_type_id: string;
    owner_email?: string;
}

export interface DeviceShareRow {
    device_code: string;
    user_id: number;
    shared_by: number;
    created_at: string;
    user_email: string;
    shared_by_email?: string | null;
}

export interface DeviceShareInvitationRow {
    id: number;
    device_code: string;
    email: string;
    invited_by: number;
    expires_at: string;
    accepted_at?: string | null;
    created_at: string;
    invited_by_email?: string | null;
}
