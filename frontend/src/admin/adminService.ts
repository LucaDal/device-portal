import { apiFetchWithAuth } from "../api/apiClient";

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
