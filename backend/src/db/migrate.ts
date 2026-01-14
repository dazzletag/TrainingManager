import { AppDataSource } from "./data-source";

async function migrate(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  try {
    await dataSource.runMigrations();
    console.log("Migrations applied");
  } finally {
    await dataSource.destroy();
  }
}

migrate().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
