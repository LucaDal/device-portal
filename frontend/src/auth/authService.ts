import { User } from "@shared/types/user";
import { apiFetch, apiFetchWithAuth } from "../api/apiClient";
import { Role } from "@shared/constants/auth";

interface LoginPayload {
    email: string;
    password: string;
}

interface RegisterUser {
    email: string;
    password: string;
    role: Role;
};

interface LoginResponse {
    token: string;
    user: User;
}
interface RegisterResponse {
    id : number;
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

export async function signup(payload: RegisterUser):Promise<RegisterResponse> {
    return apiFetch<RegisterResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ ok: boolean }> {
    return apiFetchWithAuth<{ ok: boolean }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
