import { apiFetch } from "../api/apiClient";

export async function getSchema(): Promise<any> {
  return apiFetch<any>("/admin/schema", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    }
  });
}

export async function updateSchema(schema: any): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/admin/schema", {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    },
    body: JSON.stringify(schema)
  });
}

