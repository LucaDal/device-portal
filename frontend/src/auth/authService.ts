import { User } from "@shared/types/user";
import { apiFetch } from "../api/apiClient";
import { useAuth} from "./AuthContext";

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
    id : number;
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




