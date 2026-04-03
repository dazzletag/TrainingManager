import "reflect-metadata";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import routes from "./routes";
import { AppDataSource } from "./db/data-source";
import { mockAuthMiddleware } from "./middleware/auth";
import { azureAuthEnabled, azureAuthMiddleware, azureUserMapper } from "./middleware/azureAuth";
import { syncPlandayData } from "./services/plandaySync";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
if (azureAuthEnabled) {
  app.use(azureAuthMiddleware);
  app.use(azureUserMapper);
  app.use(mockAuthMiddleware);
} else {
  app.use(mockAuthMiddleware);
}
app.use("/api/v1", routes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if ((err as { name?: string }).name === "UnauthorizedError") {
    return res.status(401).json({ message: "Unauthorized" });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

async function start(): Promise<void> {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  app.listen(port, () => {
    console.log(`Backend listening on ${port}`);
  });

  try {
    await syncPlandayData();
  } catch (error) {
    console.warn("Initial Planday sync did not complete", error);
  }

  const syncIntervalMs = Number(process.env.PLANDAY_SYNC_INTERVAL_MS ?? 1800000);
  setInterval(() => {
    syncPlandayData().catch((error) => console.error("Planday sync failure", error));
  }, syncIntervalMs);
}

start().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
