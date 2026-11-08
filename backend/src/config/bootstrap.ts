import { createUser } from "../services/userService";
import { findUserByEmail } from "../repositories/userRepository";
import "dotenv/config";
import { normalizeEmail } from "../utils/email";
import { ROLES } from "@shared/constants/auth";

export function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  console.info("email:", email);
  console.info("password:", password ? "********" : undefined);

  if (!email || !password) {
    console.error("ADMIN_EMAIL or ADMIN_PASSWORD not set!");
    return;
  }

  try {
    const row = findUserByEmail(normalizeEmail(email));
    if (row) {
      console.info("User already exists");
      return;
    }

    createUser(String(email), String(password), ROLES.ADMIN);
    console.info("User created");
  } catch (err) {
    console.error("Error creating user:", err);
  }
}
