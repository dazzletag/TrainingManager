import { AppDataSource } from "../db/data-source";
import { AuditLog } from "../entities/AuditLog";

interface AuditOptions {
  who: string;
  what: string;
  why: string;
}

export async function logAudit(options: AuditOptions): Promise<void> {
  const repository = AppDataSource.getRepository(AuditLog);

  await repository.save(
    repository.create({
      ...options,
      when: new Date(),
    }),
  );
}
