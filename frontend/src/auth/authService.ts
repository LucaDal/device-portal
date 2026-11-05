import { User } from "@shared/types/user";
import { apiFetch, apiFetchWithAuth } from "../api/apiClient";

interface LoginPayload {
    email: string;
    password: string;
}

interface LoginResponse {
    user: User;
}
interface ChangePasswordPayload {
    currentPassword: string;
    newPassword: string;
}


export async function login(payload: LoginPayload): Promise<LoginResponse> {
    return  await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export async function loadCurrentUser(): Promise<{ user: User }> {
    return apiFetchWithAuth<{ user: User }>("/auth/me", {
        suppressUnauthorizedRedirect: true,
    });
}

export async function logout(): Promise<{ ok: boolean }> {
    return apiFetchWithAuth<{ ok: boolean }>("/auth/logout", {
        method: "POST",
    });
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ ok: boolean }> {
    return apiFetchWithAuth<{ ok: boolean }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
