import { UsersController } from "../controllers/usersController";
import { DB } from "./database";
import "dotenv/config";

export async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  console.info("email:", email);
  console.info("password:", password ? "********" : undefined);

  if (!email || !password) {
    console.error("ADMIN_EMAIL or ADMIN_PASSWORD not set!");
    return;
  }

  try {
    const row = DB.prepare("SELECT id FROM users WHERE email = ?").get(String(email));
    if (row) {
      console.info("User already exists");
      return;
    }

    UsersController.createUser(String(email), String(password), "admin");
    console.info("User created");
  } catch (err) {
    console.error("Error creating user:", err);
  }
}

