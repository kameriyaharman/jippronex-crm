import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { HttpError, forbidden } from "./util.js";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

type UserToken = { kind: "user"; sub: string; imp?: string };
type AdminToken = { kind: "admin"; sub: string; role: string };

export const signUser = (userId: string, impersonatedBy?: string) =>
  jwt.sign({ kind: "user", sub: userId, imp: impersonatedBy } satisfies UserToken, SECRET, { expiresIn: impersonatedBy ? "2h" : "60d" });
export const signAdmin = (adminId: string, role: string) =>
  jwt.sign({ kind: "admin", sub: adminId, role } satisfies AdminToken, SECRET, { expiresIn: "7d" });

function bearer(req: Request) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : (req.query.token as string | undefined);
}

export type Role = "OWNER" | "BILLING" | "ACCOUNTANT" | "STORE";
export type Perm =
  | "invoice.create" | "invoice.edit" | "cost.view" | "stock.adjust"
  | "accounts" | "reports.export" | "purchase" | "parties" | "settings" | "payments";

/** Role permission matrix — same as the Settings › Role permissions table in the design */
export const PERMS: Record<Role, Perm[]> = {
  OWNER: ["invoice.create", "invoice.edit", "cost.view", "stock.adjust", "accounts", "reports.export", "purchase", "parties", "settings", "payments"],
  BILLING: ["invoice.create", "parties", "payments"],
  ACCOUNTANT: ["cost.view", "accounts", "reports.export", "parties", "payments"],
  STORE: ["stock.adjust", "purchase"],
};

declare global {
  namespace Express {
    interface Request {
      user?: typeof schema.users.$inferSelect;
      businessId?: string;
      role?: Role;
      admin?: typeof schema.adminUsers.$inferSelect;
      impersonatedBy?: string;
    }
  }
}

/** Requires a logged-in business user. Business chosen with header `x-business-id` (or their first business). */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, "Login required");
  let payload: UserToken;
  try { payload = jwt.verify(token, SECRET) as UserToken; } catch { throw new HttpError(401, "Session expired, please login again"); }
  if (payload.kind !== "user") throw new HttpError(401, "Login required");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.sub) });
  if (!user) throw new HttpError(401, "User not found");
  req.user = user;
  req.impersonatedBy = payload.imp;
  next();
}

export async function requireBusiness(req: Request, _res: Response, next: NextFunction) {
  const wanted = (req.headers["x-business-id"] as string) || undefined;
  const rows = await db.select({ m: schema.memberships, b: schema.businesses })
    .from(schema.memberships)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId))
    .where(and(eq(schema.memberships.userId, req.user!.id), eq(schema.memberships.status, "ACTIVE")))
    .orderBy(desc(schema.memberships.createdAt));
  const row = wanted ? rows.find((r) => r.b.id === wanted) : rows[0];
  if (!row) throw new HttpError(428, "Business setup required");
  if (row.b.status === "SUSPENDED") throw new HttpError(423, "This account is suspended. Please contact Jippronex support.");
  req.businessId = row.b.id;
  req.role = row.m.role;
  next();
}

export const can = (req: Request, perm: Perm) => !!req.role && PERMS[req.role].includes(perm);
export const need = (perm: Perm) => (req: Request, _res: Response, next: NextFunction) => {
  if (!can(req, perm)) throw forbidden();
  next();
};

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, "Login required");
  let payload: AdminToken;
  try { payload = jwt.verify(token, SECRET) as AdminToken; } catch { throw new HttpError(401, "Session expired"); }
  if (payload.kind !== "admin") throw new HttpError(401, "Admin login required");
  const admin = await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, payload.sub) });
  if (!admin || !admin.active) throw new HttpError(401, "Admin not found");
  req.admin = admin;
  next();
}
export const superOnly = (req: Request, _res: Response, next: NextFunction) => {
  if (req.admin?.role !== "SUPER_ADMIN") throw forbidden("Super admin only");
  next();
};
