import bcrypt from "bcrypt";
import { ROLES, Role } from "@shared/constants/auth";
import { insertUser } from "../repositories/userRepository";
import { normalizeEmail } from "../utils/email";

export function createUser(email: string, password: string, role: Role = ROLES.USER, mustChangePassword = false) {
    try {
        return insertUser({
            email: normalizeEmail(email),
            password_hash: bcrypt.hashSync(password, 10),
            role,
            must_change_password: mustChangePassword ? 1 : 0
        });
    } catch (error) {
        if (String(error).includes("UNIQUE")) throw new Error("EMAIL_EXISTS");
        throw error;
    }
}
