import { MigrationInterface, QueryRunner } from "typeorm";

export class ReportingViews1705400002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_training_compliance_current AS
      WITH person_groups AS (
        SELECT personId, roleId FROM person_group
        UNION
        SELECT id AS personId, roleId FROM person
      ),
      requirement_links AS (
        SELECT pg.personId, trg.requirementId, trg.roleId, trg.requiredLevel, trg.mandatory
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
        p.id AS personId,
        p.fullName,
        p.email,
        p.homeLocation,
        p.employmentStatus,
        r.id AS roleId,
        r.name AS roleName,
        r.category AS roleCategory,
        tr.id AS requirementId,
        tr.name AS requirementName,
        tr.validityPeriodMonths,
        rl.requiredLevel,
        rl.mandatory,
        le.lastCompletedDate,
        le.nextDueDate,
        CASE
          WHEN le.nextDueDate IS NULL THEN NULL
          ELSE DATEDIFF(day, GETUTCDATE(), le.nextDueDate)
        END AS daysUntilDue,
        CASE
          WHEN le.nextDueDate IS NULL THEN NULL
          WHEN le.nextDueDate < GETUTCDATE() THEN DATEDIFF(day, le.nextDueDate, GETUTCDATE())
          ELSE 0
        END AS daysOverdue,
        CASE
          WHEN le.nextDueDate IS NULL THEN 'missing'
          WHEN le.nextDueDate < GETUTCDATE() THEN 'overdue'
          WHEN DATEDIFF(day, GETUTCDATE(), le.nextDueDate) <= 30 THEN 'due_30'
          WHEN DATEDIFF(day, GETUTCDATE(), le.nextDueDate) <= 60 THEN 'due_60'
          WHEN DATEDIFF(day, GETUTCDATE(), le.nextDueDate) <= 90 THEN 'due_90'
          ELSE 'compliant'
        END AS complianceStatus
      FROM requirement_links rl
      INNER JOIN person p ON p.id = rl.personId
      INNER JOIN role r ON r.id = rl.roleId
      INNER JOIN training_requirement tr ON tr.id = rl.requirementId
      LEFT JOIN latest_evidence le ON le.personId = rl.personId AND le.requirementId = rl.requirementId;
    `);

    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_training_due_forecast AS
      SELECT
        homeLocation,
        requirementName,
        DATEFROMPARTS(YEAR(nextDueDate), MONTH(nextDueDate), 1) AS dueMonth,
        COUNT(*) AS dueCount,
        SUM(CASE WHEN nextDueDate < GETUTCDATE() THEN 1 ELSE 0 END) AS overdueCount,
        SUM(CASE WHEN nextDueDate >= GETUTCDATE() AND nextDueDate < DATEADD(day, 30, GETUTCDATE()) THEN 1 ELSE 0 END) AS due30Count,
        SUM(CASE WHEN nextDueDate >= DATEADD(day, 30, GETUTCDATE()) AND nextDueDate < DATEADD(day, 60, GETUTCDATE()) THEN 1 ELSE 0 END) AS due60Count,
        SUM(CASE WHEN nextDueDate >= DATEADD(day, 60, GETUTCDATE()) AND nextDueDate < DATEADD(day, 90, GETUTCDATE()) THEN 1 ELSE 0 END) AS due90Count
      FROM vw_training_compliance_current
      WHERE nextDueDate IS NOT NULL
      GROUP BY homeLocation, requirementName, DATEFROMPARTS(YEAR(nextDueDate), MONTH(nextDueDate), 1);
    `);

    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_training_by_home_role AS
      SELECT
        homeLocation,
        roleName,
        roleCategory,
        COUNT(DISTINCT personId) AS totalPeople,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliantCount,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdueCount,
        SUM(CASE WHEN complianceStatus = 'missing' THEN 1 ELSE 0 END) AS missingCount
      FROM vw_training_compliance_current
      WHERE mandatory = 1
      GROUP BY homeLocation, roleName, roleCategory;
    `);

    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_training_sessions_utilisation AS
      SELECT
        s.id AS sessionId,
        s.name AS sessionName,
        s.type AS sessionType,
        CASE WHEN sa.day = 1 THEN s.day1 ELSE s.day2 END AS sessionDate,
        sa.day,
        COUNT(DISTINCT sa.personId) AS assignedCount,
        16 AS capacity,
        CAST(ROUND(COUNT(DISTINCT sa.personId) * 100.0 / 16, 0) AS int) AS utilisationPct
      FROM training_session s
      LEFT JOIN session_assignment sa ON sa.sessionId = s.id
      GROUP BY s.id, s.name, s.type, sa.day, CASE WHEN sa.day = 1 THEN s.day1 ELSE s.day2 END;
    `);

    await queryRunner.query(`
      CREATE OR ALTER VIEW vw_training_monthly_completion AS
      SELECT
        tr.name AS requirementName,
        DATEFROMPARTS(YEAR(e.validFrom), MONTH(e.validFrom), 1) AS completedMonth,
        COUNT(*) AS completionCount
      FROM evidence e
      INNER JOIN assignment a ON a.id = e.assignmentId
      INNER JOIN training_requirement tr ON tr.id = a.requirementId
      WHERE e.validFrom IS NOT NULL
      GROUP BY tr.name, DATEFROMPARTS(YEAR(e.validFrom), MONTH(e.validFrom), 1);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP VIEW IF EXISTS vw_training_monthly_completion");
    await queryRunner.query("DROP VIEW IF EXISTS vw_training_sessions_utilisation");
    await queryRunner.query("DROP VIEW IF EXISTS vw_training_by_home_role");
    await queryRunner.query("DROP VIEW IF EXISTS vw_training_due_forecast");
    await queryRunner.query("DROP VIEW IF EXISTS vw_training_compliance_current");
  }
}
