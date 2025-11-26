import { DB } from "../config/database";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt";
import { User } from "@shared/types/user";
import { UsersController } from "./usersController";

export const AuthController = {

    signup: async (req: any, res: any) => {
        const { email, password, role } = req.body;
        try {
            const row_id = UsersController.createUser(email,password,role);
            res.send({ id: row_id });
        } catch (err: any) {
            if (err.message === "EMAIL_EXISTS") {
                return res.status(400).send({ error: "Email already exists" });
            }
            res.status(500).send({ error: "Server error" });
        }
    },

    login: async (req: any, res: any) => {
        const { email, password } = req.body;
        const row = DB.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;;

        if (!row) return res.status(401).send({ error: "Invalid" });

        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return res.status(401).send({ error: "invalid" });

        res.send({ token: generateToken(row), user: row });
    }
};
