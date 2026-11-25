import { Router, type Request, type Response, type NextFunction } from "express";
import { requireUser, requireBusiness } from "../../lib/auth.js";
import { HttpError } from "../../lib/util.js";
import { currentSubscription } from "../../services/subscription.js";
import { inventoryRouter } from "./inventory.js";
import { salesRouter } from "./sales.js";
import { moneyRouter } from "./money.js";
import { reportsRouter } from "./reports.js";
import { settingsRouter } from "./settings.js";

export const crmRouter = Router();
crmRouter.use(requireUser, requireBusiness);

/** Subscription gate: expired plans are read-only; features follow the plan. */
async function planGate(req: Request, _res: Response, next: NextFunction) {
  const path = req.path;
  if (path.startsWith("/settings")) return next();
  const sub = await currentSubscription(req.businessId!);
  const f = (sub?.plan.features || {}) as Record<string, boolean>;
  if (req.method !== "GET" && !sub?.usable) throw new HttpError(402, "Your Jippronex plan has expired. Renew to continue billing — your data is safe.");
  const needs =
    path.startsWith("/purchases") ? "purchase" :
    path.startsWith("/stock") ? "inventory" :
    path.startsWith("/accounts") ? "accounts" : null;
  if (needs && sub && !f[needs]) throw new HttpError(402, `This feature is not in your ${sub.plan.name} plan. Upgrade to use it.`);
  next();
}
crmRouter.use(planGate);

crmRouter.use(inventoryRouter);
crmRouter.use(salesRouter);
crmRouter.use(moneyRouter);
crmRouter.use(reportsRouter);
crmRouter.use("/settings", settingsRouter);
