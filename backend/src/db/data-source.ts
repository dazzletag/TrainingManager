import { DataSource } from "typeorm";
import type { SqlServerConnectionCredentialsAuthenticationOptions } from "typeorm/driver/sqlserver/SqlServerConnectionCredentialsOptions";
import dotenv from "dotenv";
import { Person } from "../entities/Person";
import { Role } from "../entities/Role";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { Assignment } from "../entities/Assignment";
import { Evidence } from "../entities/Evidence";
import { AuditLog } from "../entities/AuditLog";
import { TrainingSession } from "../entities/TrainingSession";
import { SessionAssignment } from "../entities/SessionAssignment";
import { AppUser } from "../entities/AppUser";
import { RecommendationSettings } from "../entities/RecommendationSettings";
import { TrainingUnavailability } from "../entities/TrainingUnavailability";
import { TrainingRequirementSection } from "../entities/TrainingRequirementSection";

dotenv.config();

const host = process.env.DB_HOST ?? "tm-trainingmgr-sql.database.windows.net";
const port = Number(process.env.DB_PORT ?? 1433);
const username = process.env.DB_USERNAME ?? "sa";
const password = process.env.DB_PASSWORD ?? "YourStrong!Passw0rd";
const database = process.env.DB_NAME ?? "training_manager";
const authType = process.env.DB_AUTHENTICATION?.trim();
const authClientId = process.env.DB_AUTH_CLIENT_ID?.trim();
const authentication: SqlServerConnectionCredentialsAuthenticationOptions | undefined =
  authType === "azure-active-directory-default"
    ? {
        type: "azure-active-directory-default",
        options: authClientId ? { clientId: authClientId } : {},
      }
    : undefined;

export const AppDataSource = new DataSource({
  type: "mssql",
  host,
  port,
  username: authentication ? undefined : username,
  password: authentication ? undefined : password,
  database,
  authentication,
  synchronize: false,
  logging: false,
  entities: [
    Person,
    Role,
    TrainingRequirement,
    TrainingRequirementGroup,
    Assignment,
    Evidence,
    AuditLog,
    TrainingSession,
    SessionAssignment,
    AppUser,
    RecommendationSettings,
    TrainingUnavailability,
    TrainingRequirementSection,
  ],
  migrations: [__dirname + "/migrations/*.{ts,js}"],
  options: {
    encrypt: true,
    enableArithAbort: true,
  },
});
