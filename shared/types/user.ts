export interface User {
	id: number;
	email: string;
	password_hash: string;
	role: UserRole;
}

export enum UserRole {
	ADMIN = "admin",
	USER = "user",
	DEV = "dev",
}