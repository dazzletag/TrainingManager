import { MigrationInterface, QueryRunner, Table, TableColumn } from "typeorm";

export class NextBestCourses1705400004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "importanceLevel",
        type: "int",
        default: 3,
      }),
    );

    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "minimumAttendees",
        type: "int",
        default: 8,
      }),
    );

    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "enabled",
        type: "bit",
        default: 1,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "recommendation_settings",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "atRiskWindowDays", type: "int", default: 60 },
          { name: "minimumAttendeesDefault", type: "int", default: 8 },
          { name: "importanceWeightMultiplier", type: "int", default: 2 },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.query(`
      IF NOT EXISTS (SELECT 1 FROM recommendation_settings)
      INSERT INTO recommendation_settings (atRiskWindowDays, minimumAttendeesDefault, importanceWeightMultiplier, createdAt, updatedAt)
      VALUES (60, 8, 2, GETUTCDATE(), GETUTCDATE());
    `);

    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_employee_training_status AS
      WITH person_groups AS (
        SELECT personId, roleId FROM person_group
        UNION
        SELECT id AS personId, roleId FROM person
      ),
      requirement_links AS (
        SELECT pg.personId, trg.requirementId
        FROM person_groups pg
        INNER JOIN training_requirement_group trg ON trg.roleId = pg.roleId
      ),
      latest_evidence AS (
        SELECT a.personId,
               a.requirementId,
               MAX(e.validFrom) AS lastCompletedDate,
               MAX(e.validTo) AS nextDueDate
        FROM assignment a
        LEFT JOIN evidence e ON e.assignmentId = a.id
        GROUP BY a.personId, a.requirementId
      )
      SELECT
        rl.personId AS employeeId,
        rl.requirementId AS courseId,
        le.lastCompletedDate,
        le.nextDueDate AS expiryDate,
        CASE
          WHEN le.nextDueDate IS NULL THEN NULL
          ELSE DATEDIFF(day, GETUTCDATE(), le.nextDueDate)
        END AS daysToExpiry,
        CASE
          WHEN le.nextDueDate IS NULL THEN 'Expired'
          WHEN le.nextDueDate < GETUTCDATE() THEN 'Expired'
          WHEN DATEDIFF(day, GETUTCDATE(), le.nextDueDate) <= cfg.atRiskWindowDays THEN 'AtRisk'
          ELSE 'Valid'
        END AS status
      FROM requirement_links rl
      LEFT JOIN latest_evidence le ON le.personId = rl.personId AND le.requirementId = rl.requirementId
      CROSS APPLY (
        SELECT TOP 1 atRiskWindowDays
        FROM recommendation_settings
        ORDER BY updatedAt DESC
      ) cfg;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP VIEW IF EXISTS vw_employee_training_status");
    await queryRunner.query("DROP TABLE IF EXISTS recommendation_settings");
    await queryRunner.dropColumn("training_requirement", "enabled");
    await queryRunner.dropColumn("training_requirement", "minimumAttendees");
    await queryRunner.dropColumn("training_requirement", "importanceLevel");
  }
}
