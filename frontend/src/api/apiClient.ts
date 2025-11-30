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
        console.error(err);
        return Promise.reject(err);
    }
    const payload = await res.json();
    return (payload as T) as T;
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
export async function apiFetchFD(url: string, method: string, data?: FormData | null): Promise<Response> {
    const options: RequestInit = {
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        method,
        credentials: "include",
    };
    if (data) {
        options.body = data;
    }
    const res = await fetch(`${API_BASE}${url}`, options);

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
            errBody.error || "Errore durante il salvataggio del device type"
        );
    }
    return res;
}
