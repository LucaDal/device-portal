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
  user_id: string;
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

export async function register(payload: RegisterUser): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


