import { Role } from "../constants/auth";

export interface User {
	id: number;
	email: string;
	role: Role;
	must_change_password?: number;
	created_at?: string;
}

export interface UserWithPassword extends User {
	password_hash: string;
}
