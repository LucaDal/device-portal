const getDefaultApiBase = () => {
    if (typeof window === "undefined") {
        return "/api";
    }
    // If we're serving the UI directly on 5173 (dev or standalone), hit the backend on the same host:3000.
    if (window.location.port === "5173") {
        return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    // Otherwise, assume a reverse proxy exposes /api on the same origin.
    return "/api";
};

const resolveApiBase = () => {
    const envBase = import.meta.env.VITE_BACKEND_URL;
    // If the bundle was built with localhost but we're being served from a different host,
    // prefer auto-detection to avoid pointing to the client's localhost.
    if (
        envBase &&
        typeof window !== "undefined" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1" &&
        envBase.includes("localhost")
    ) {
        return getDefaultApiBase();
    }
    return (envBase || getDefaultApiBase());
};

const API_BASE = resolveApiBase().replace(/\/$/, "");

const handleUnauthorized = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    // Hard redirect to force full reset of app state
    window.location.href = "/login";
};

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
        if (res.status === 401) {
            handleUnauthorized();
        }
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
        if (res.status === 401) {
            handleUnauthorized();
        }
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
            errBody.error || "Errore durante il salvataggio del device type"
        );
    }
    return res;
}
