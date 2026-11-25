import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { runMigrations } from "./db/index.js";
import { errorHandler } from "./lib/util.js";
import { authRouter } from "./routes/auth.js";
import { crmRouter } from "./routes/crm/index.js";
import { adminRouter } from "./routes/admin/index.js";
import { publicRouter } from "./routes/public.js";
import { bootstrap, startJobs } from "./jobs.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
const origins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json({ limit: "8mb", verify: (req: any, _res, buf) => { if (req.url?.startsWith("/webhooks")) req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev"));

app.get("/", (_req, res) => res.json({ name: "Jippronex API", docs: "/health" }));
app.use(publicRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", crmRouter);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
(async () => {
  await runMigrations();
  await bootstrap();
  app.listen(port, () => console.log(`Jippronex API on :${port}`));
  startJobs();
})().catch((e) => { console.error(e); process.exit(1); });
