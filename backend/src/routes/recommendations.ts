import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { getRecommendationSettings } from "../services/recommendationSettings";

const router = Router();

const RISK_EXPIRED_WEIGHT = 3;
const RISK_AT_RISK_WEIGHT = 2;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

router.get("/next-courses", async (req, res) => {
  const requiredLevelFilter = Number(req.query.requiredLevel ?? 0);
  const settings = await getRecommendationSettings();

  const rows = await AppDataSource.query(`
    WITH course_status AS (
      SELECT
        ets.courseId,
        COUNT(DISTINCT CASE WHEN ets.status = 'Expired' THEN ets.employeeId END) AS expiredCount,
        COUNT(DISTINCT CASE WHEN ets.status = 'AtRisk' THEN ets.employeeId END) AS atRiskCount,
        COUNT(DISTINCT CASE WHEN ets.status IN ('Expired', 'AtRisk') THEN ets.employeeId END) AS eligibleCount,
        COUNT(DISTINCT CASE WHEN ets.expiryDate IS NULL THEN ets.employeeId END) AS missingCount,
        AVG(CAST(ets.daysToExpiry AS float)) AS averageDaysToExpiry
      FROM vw_employee_training_status ets
      INNER JOIN person p ON p.id = ets.employeeId
      WHERE p.isActive = 1
      GROUP BY ets.courseId
    )
    SELECT
      tr.id AS courseId,
      tr.name AS courseName,
      tr.importanceLevel,
      tr.requiredLevel,
      tr.minimumAttendees,
      tr.enabled,
      cs.eligibleCount,
      cs.expiredCount,
      cs.atRiskCount,
      cs.averageDaysToExpiry,
      cs.missingCount
    FROM course_status cs
    INNER JOIN training_requirement tr ON tr.id = cs.courseId
    WHERE tr.enabled = 1
      AND tr.name NOT LIKE '%SCTV%'
      AND tr.name NOT LIKE '%Competency%'
      AND tr.name NOT LIKE '%Induction%'
      AND tr.name NOT LIKE '%Flu Vaccine%'
      AND tr.name <> 'Fire Drill'
      AND tr.name <> 'Level 2 Adult Care'
      AND tr.name <> 'Most Recent Flu Vaccination'
      AND tr.name <> 'Care Certificate'
      AND tr.name <> 'Mandatory Training'
      AND tr.name <> 'Level 3 Lead Adult Care'
      AND tr.name NOT LIKE '% next due%'
      ${requiredLevelFilter ? "AND tr.requiredLevel = " + requiredLevelFilter : ""};
  `);

  const recommendations = rows
    .map((row: any) => {
      const expiredCount = toNumber(row.expiredCount);
      const atRiskCount = toNumber(row.atRiskCount);
      const eligibleCount = toNumber(row.eligibleCount);
      const minimumAttendees = Math.max(
        1,
        toNumber(row.minimumAttendees, settings.minimumAttendeesDefault),
      );
      const importanceLevel = Math.max(1, toNumber(row.importanceLevel, 1));
      const requiredLevel = Math.max(1, toNumber(row.requiredLevel, 1));
      const missingCount = toNumber(row.missingCount);
      const averageDaysToExpiryRaw = row.averageDaysToExpiry;
      const averageDaysToExpiry =
        averageDaysToExpiryRaw === null || averageDaysToExpiryRaw === undefined
          ? null
          : Math.round(toNumber(averageDaysToExpiryRaw));

      const riskWeight = expiredCount * RISK_EXPIRED_WEIGHT + atRiskCount * RISK_AT_RISK_WEIGHT;
      const importanceWeight = importanceLevel * settings.importanceWeightMultiplier;
      const volumeGate = eligibleCount >= minimumAttendees;
      const recommendationScore = (riskWeight + importanceWeight) * (volumeGate ? 1 : 0);

      const riskTotal = expiredCount + atRiskCount;
      const rationaleParts = [
        `${riskTotal} staff expired or expiring within ${settings.atRiskWindowDays} days`,
        `importance level ${importanceLevel}`,
        `cohort size ${eligibleCount} meets minimum ${minimumAttendees}`,
      ];
      if (missingCount > 0) {
        rationaleParts.push(`${missingCount} staff missing completion dates`);
      }

      return {
        courseId: row.courseId,
        courseName: row.courseName,
        importanceLevel,
        requiredLevel,
        eligibleCount,
        expiredCount,
        atRiskCount,
        averageDaysToExpiry,
        recommendationScore,
        rationale: rationaleParts.join("; ") + ".",
        _volumeGate: volumeGate,
      };
    })
    .filter((item: any) => item._volumeGate)
    .sort((a: any, b: any) => b.recommendationScore - a.recommendationScore)
    .map(({ _volumeGate, ...item }: any) => item);

  let totals = { expiredCount: 0, atRiskCount: 0 };
  if (recommendations.length) {
    const placeholders = recommendations.map((_: any, index: number) => `@${index}`).join(", ");
    const totalsRows = await AppDataSource.query(
      `
        SELECT
          COUNT(DISTINCT CASE WHEN ets.status = 'Expired' THEN ets.employeeId END) AS expiredCount,
          COUNT(DISTINCT CASE WHEN ets.status = 'AtRisk' THEN ets.employeeId END) AS atRiskCount
        FROM vw_employee_training_status ets
        INNER JOIN person p ON p.id = ets.employeeId
        WHERE p.isActive = 1
          AND ets.courseId IN (${placeholders});
      `,
      recommendations.map((item: any) => item.courseId),
    );
    if (totalsRows.length) {
      totals = {
        expiredCount: toNumber(totalsRows[0].expiredCount),
        atRiskCount: toNumber(totalsRows[0].atRiskCount),
      };
    }
  }

  res.json({ recommendations, totals });
});

router.get("/next-courses/:courseId/eligible", async (req, res) => {
  const courseId = req.params.courseId;
  if (!courseId) {
    return res.status(400).json({ message: "Course ID is required" });
  }

  const eligible = await AppDataSource.query(
    `
      SELECT
        ets.employeeId,
        p.fullName,
        p.homeLocation,
        ets.daysToExpiry,
        ets.status
      FROM vw_employee_training_status ets
      INNER JOIN person p ON p.id = ets.employeeId
      WHERE ets.courseId = @0
        AND p.isActive = 1
        AND ets.status IN ('Expired', 'AtRisk')
      ORDER BY CASE WHEN ets.status = 'Expired' THEN 0 ELSE 1 END, ets.daysToExpiry ASC;
    `,
    [courseId],
  );

  res.json({
    courseId,
    eligible: eligible.map((entry: any) => ({
      employeeId: entry.employeeId,
      name: entry.fullName,
      homeLocation: entry.homeLocation,
      daysToExpiry: entry.daysToExpiry === null ? null : Math.round(toNumber(entry.daysToExpiry)),
      status: entry.status,
    })),
  });
});

export default router;
