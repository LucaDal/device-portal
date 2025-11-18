const API_BASE = "/api";

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include",
    ...options
  });
  if (!res.ok) {
    const err = await res.json();
    return Promise.reject(err);
  }
  return (await res.json()) as T;
}

export async function apiFetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  return await apiFetch<T>(url, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    },
    ...options
  });
}