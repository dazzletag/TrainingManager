import { MigrationInterface, QueryRunner } from "typeorm";

export class FixEmployeeTrainingStatusView1705400005000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_employee_training_status AS
      WITH person_groups AS (
        SELECT personId, roleId FROM person_group
        UNION
        SELECT id AS personId, roleId FROM person
      ),
      requirement_links AS (
        SELECT DISTINCT pg.personId, trg.requirementId
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
}
