import { AUTH_ERROR_CODES } from "@shared/constants/auth";
import { navigateTo } from "../utils/navigation";

type ApiFetchOptions = RequestInit & {
    suppressUnauthorizedRedirect?: boolean;
};

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

const API_BASE = getDefaultApiBase().replace(/\/$/, "");

const handleUnauthorized = () => {
    localStorage.removeItem("user");
    navigateTo("/login");
};

export async function apiFetch<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
    const { suppressUnauthorizedRedirect = false, ...requestOptions } = options;
    const mergedHeaders: HeadersInit = {
        "Content-Type": "application/json",
        ...(requestOptions.headers || {})
    };
    const res = await fetch(`${API_BASE}${url}`, {
        ...requestOptions,
        headers: mergedHeaders,
        credentials: "include",
    });
    if (!res.ok) {
        if (res.status === 401 && !suppressUnauthorizedRedirect) {
            handleUnauthorized();
        }
        const err = await res.json();
        if (res.status === 403 && err?.code === AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED) {
            navigateTo("/change-password");
        }
        console.error(err);
        return Promise.reject(err);
    }
    const payload = await res.json();
    return (payload as T) as T;
}

export async function apiFetchWithAuth<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
    return await apiFetch<T>(url, options);
}
export async function apiFetchFD(url: string, method: string, data?: FormData | null): Promise<Response> {
    const options: RequestInit = {
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
            errBody.error || "Error while saving device type"
        );
    }
    return res;
}
