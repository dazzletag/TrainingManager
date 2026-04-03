import { MigrationInterface, QueryRunner } from "typeorm";

const GROUPS = [
  { externalId: "21759", name: "Activities" },
  { externalId: "21760", name: "Admin" },
  { externalId: "20393", name: "Ancillary" },
  { externalId: "20394", name: "Care" },
  { externalId: "20396", name: "Chefs" },
  { externalId: "20398", name: "Domestic" },
  { externalId: "21761", name: "Driver" },
  { externalId: "20397", name: "Kitchen" },
  { externalId: "20399", name: "Laundry" },
  { externalId: "21758", name: "Maintenance" },
  { externalId: "21762", name: "Minibus Escort" },
  { externalId: "21756", name: "Nurse Associate" },
  { externalId: "20392", name: "Nurses" },
  { externalId: "20400", name: "Senior Carers" },
  { externalId: "20401", name: "Teamleaders" },
];

export class SeedEmployeeGroups1775000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const group of GROUPS) {
      await queryRunner.query(
        `IF NOT EXISTS (SELECT 1 FROM "role" WHERE "externalId" = @0)
         INSERT INTO "role" ("id", "externalId", "name", "category", "description", "createdAt", "updatedAt")
         VALUES (NEWID(), @0, @1, 'Staff', 'Planday employee group', GETUTCDATE(), GETUTCDATE())`,
        [group.externalId, group.name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ids = GROUPS.map((g) => `'${g.externalId}'`).join(", ");
    await queryRunner.query(`DELETE FROM "role" WHERE "externalId" IN (${ids})`);
  }
}
