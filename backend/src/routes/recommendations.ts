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

router.get("/next-courses", async (_req, res) => {
  const settings = await getRecommendationSettings();

  const rows = await AppDataSource.query(`
    WITH course_status AS (
      SELECT
        ets.courseId,
        SUM(CASE WHEN ets.status = 'Expired' THEN 1 ELSE 0 END) AS expiredCount,
        SUM(CASE WHEN ets.status = 'AtRisk' THEN 1 ELSE 0 END) AS atRiskCount,
        SUM(CASE WHEN ets.status IN ('Expired', 'AtRisk') THEN 1 ELSE 0 END) AS eligibleCount,
        SUM(CASE WHEN ets.expiryDate IS NULL THEN 1 ELSE 0 END) AS missingCount,
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
      AND tr.name NOT LIKE '%Flu Vaccine%';
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

  res.json({ recommendations });
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
