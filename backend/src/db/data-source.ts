import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { Person } from "../entities/Person";
import { Role } from "../entities/Role";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Assignment } from "../entities/Assignment";
import { Evidence } from "../entities/Evidence";
import { AuditLog } from "../entities/AuditLog";
import { TrainingSession } from "../entities/TrainingSession";
import { SessionAssignment } from "../entities/SessionAssignment";

dotenv.config();

const host = process.env.DB_HOST ?? "localhost";
const port = Number(process.env.DB_PORT ?? 1433);
const username = process.env.DB_USERNAME ?? "sa";
const password = process.env.DB_PASSWORD ?? "YourStrong!Passw0rd";
const database = process.env.DB_NAME ?? "training_manager";

export const AppDataSource = new DataSource({
  type: "mssql",
  host,
  port,
  username,
  password,
  database,
  synchronize: false,
  logging: false,
  entities: [
    Person,
    Role,
    TrainingRequirement,
    Assignment,
    Evidence,
    AuditLog,
    TrainingSession,
    SessionAssignment,
  ],
  migrations: [__dirname + "/migrations/*.{ts,js}"],
  options: {
    encrypt: true,
    enableArithAbort: true,
  },
});
