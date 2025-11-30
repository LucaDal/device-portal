import { DB } from "../config/database";
import bcrypt from "bcrypt";
import { UserRole } from "@shared/types/user";

export class UsersController {
    static createUser(email: string, password: string, role: string = "user") {
        try {
            const hash = bcrypt.hashSync(password, 10);
            const stmt = DB.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`);

            const info = stmt.run(email, hash, role);
            return { id: info.lastInsertRowid };
        } catch (err) {
            if (String(err).includes("UNIQUE")) {
                throw new Error("EMAIL_EXISTS");
            }
            throw err;
        }
    }
    static list(req: any, res: any) {
        UsersController.checkAccess((req.user as any).role, UserRole.ADMIN);
        try{
            const rows = DB.prepare("SELECT * FROM users").all();
            res.send(rows);
        }catch(err){
            console.info(err);
            return res.status(400).send("Error listing users: " + err);
        }
    }

    static update(req: any, res: any) {
        UsersController.checkAccess((req.user as any).role, UserRole.ADMIN);
        try{
            const userId = Number(req.params.id);
            const { role } = req.body;
            DB.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
            res.status(200);
        }catch(err){
            console.info(err);
            return res.status(400).send("Error updating user:" + err);
        }
    }
    static delete(req: any, res: any) {
        UsersController.checkAccess((req.user as any).role, UserRole.ADMIN);
        try{
            const userId = Number(req.params.id);
            DB.prepare("DELETE FROM users WHERE id = ?").run(userId);

        }catch(err){
            console.info(err);
            return res.status(400).send("Error deleting user: " + err);
        }
    }
    static checkAccess(role: UserRole, neededRole: UserRole){
        if(role != neededRole){
            throw new Error("Access denied");
        }
    }

};


