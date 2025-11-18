import { User } from "@shared/types/user";
import { apiFetch } from "../api/apiClient";

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterUser {
		email: string;
		password: string;
		role: string;
};

interface LoginResponse {
  token: string;
  user: User;
}
interface RegisterResponse {
  id: string;
}


export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function signup(payload: RegisterUser): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}




