import { DB } from "../config/database";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt";
import { User } from "@shared/types/user";

export const AuthController = {
  register: async (req: any, res: any) => {
    const { email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);

    try {
      const stmt = DB.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)");
      const info = stmt.run(email, hash, role);
      res.send({ id: info.lastInsertRowid });
    } catch {
      res.status(400).send({ error: "Email already exists" });
    }
  },

  login: async (req: any, res: any) => {
    const { email, password } = req.body;
    const row = DB.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;;

    if (!row) return res.status(401).send({ error: "Invalid" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).send({ error: "invalid" });

    res.send({ token: generateToken(row), row });
  }
};
