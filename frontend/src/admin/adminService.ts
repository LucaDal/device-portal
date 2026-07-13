import { apiFetchWithAuth } from "../api/apiClient";
import { SavedProperties } from "@shared/types/properties";

export interface DeviceRequestLogRow {
  id: number;
  created_at: string;
  event_type: string;
  method: string;
  path: string;
  status_code: number | null;
  device_code: string | null;
  device_type_id: string | null;
  user_id: number | null;
  user_email: string | null;
  topic: string | null;
  ip: string | null;
  user_agent: string | null;
  request_summary: string | null;
  response_summary: string | null;
  error: string | null;
}

export async function getSchema(): Promise<any> {
  return apiFetchWithAuth<any>("/admin/schema", {
    method: "GET",
  });
}

export async function updateSchema(schema: any): Promise<{ ok: boolean }> {
  return apiFetchWithAuth<{ ok: boolean }>("/admin/schema", {
    method: "PUT",
    body: JSON.stringify(schema)
  });
}

export async function getDefaultProperties(): Promise<SavedProperties> {
  return apiFetchWithAuth<SavedProperties>("/manage/default-properties", {
    method: "GET",
  });
}

export async function updateDefaultProperties(properties: SavedProperties): Promise<{ ok: boolean; properties: SavedProperties }> {
  return apiFetchWithAuth<{ ok: boolean; properties: SavedProperties }>("/manage/default-properties", {
    method: "PUT",
    body: JSON.stringify({ properties }),
  });
}

export async function getRequestLogs(filters: {
  eventType?: string;
  deviceCode?: string;
  limit?: number;
}): Promise<DeviceRequestLogRow[]> {
  const params = new URLSearchParams();
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.deviceCode) params.set("deviceCode", filters.deviceCode);
  if (filters.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  return apiFetchWithAuth<DeviceRequestLogRow[]>(`/manage/request-logs${query ? `?${query}` : ""}`, {
    method: "GET",
  });
}
