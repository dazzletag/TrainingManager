const { query } = require("../shared/db");
const { buildReportingWhereClause, getReportingFilters } = require("../shared/reportingFilters");

module.exports = async function (context, req) {
  try {
    const filters = getReportingFilters(req ?? context.req);
    const { clause, params } = buildReportingWhereClause(filters, {
      home: true,
      roles: true,
      importance: true,
      courseKeywords: true,
    });

    const [overall] = await query(
      `
      SELECT
        COUNT(*) AS totalAssignments,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliantCount,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdueCount,
        SUM(CASE WHEN complianceStatus = 'due_30' THEN 1 ELSE 0 END) AS due30Count,
        SUM(CASE WHEN complianceStatus = 'due_60' THEN 1 ELSE 0 END) AS due60Count,
        SUM(CASE WHEN complianceStatus = 'due_90' THEN 1 ELSE 0 END) AS due90Count,
        AVG(CASE WHEN complianceStatus = 'overdue' THEN CAST(daysOverdue AS float) END) AS avgDaysLate
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      OPTION (RECOMPILE)
      `,
      params,
    );

    const homes = await query(
      `
      SELECT
        homeLocation AS home,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN complianceStatus IN ('overdue', 'due_30') THEN 1 ELSE 0 END) AS atRisk
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY homeLocation
      OPTION (RECOMPILE)
      `,
      params,
    );

    const { clause: forecastClause, params: forecastParams } = buildReportingWhereClause(filters, {
      home: true,
      courseKeywords: true,
    });

    const forecast = await query(
      `
      SELECT
        dueMonth,
        SUM(dueCount) AS dueCount,
        SUM(overdueCount) AS overdueCount
      FROM vw_training_due_forecast
      WHERE dueMonth >= DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1)
        AND dueMonth < DATEADD(month, 4, DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1))${forecastClause}
      GROUP BY dueMonth
      ORDER BY dueMonth
      OPTION (RECOMPILE)
      `,
      forecastParams,
    );

    const velocity = await query(
      `
      SELECT
        completedMonth,
        SUM(completionCount) AS completionCount
      FROM vw_training_monthly_completion
      WHERE completedMonth >= DATEADD(month, -12, DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1))
      GROUP BY completedMonth
      ORDER BY completedMonth
      `,
    );

    const bottlenecks = await query(
      `
      SELECT TOP 6
        requirementName,
        requiredLevel,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdueCount,
        AVG(CASE WHEN complianceStatus = 'overdue' THEN CAST(daysOverdue AS float) END) AS avgDaysLate
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY requirementName, requiredLevel
      ORDER BY overdueCount DESC, avgDaysLate DESC
      OPTION (RECOMPILE)
      `,
      params,
    );

    const distributionByHome = await query(
      `
      SELECT
        homeLocation AS home,
        COUNT(DISTINCT personId) AS totalPeople
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY homeLocation
      ORDER BY homeLocation
      OPTION (RECOMPILE)
      `,
      params,
    );

    const distributionByRole = await query(
      `
      SELECT
        roleCategory AS roleType,
        COUNT(DISTINCT personId) AS totalPeople
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY roleCategory
      ORDER BY roleCategory
      OPTION (RECOMPILE)
      `,
      params,
    );

    const repeatAttendance = await query(
      `
      SELECT TOP 8
        p.fullName AS personName,
        p.homeLocation AS home,
        COUNT(*) AS completions
      FROM evidence e
      INNER JOIN assignment a ON a.id = e.assignmentId
      INNER JOIN training_requirement tr ON tr.id = a.requirementId
      INNER JOIN person p ON p.id = a.personId
      WHERE e.validFrom >= DATEADD(month, -12, GETUTCDATE())
        AND tr.name = 'Mandatory Training'
      GROUP BY p.fullName, p.homeLocation
      ORDER BY completions DESC
      `,
    );

    const total = Number(overall?.totalAssignments ?? 0);
    const compliant = Number(overall?.compliantCount ?? 0);
    const complianceRate = total ? Math.round((compliant / total) * 100) : 0;

    const rag = homes.map((home) => {
      const totalPeople = Number(home.total ?? 0);
      const compliantCount = Number(home.compliant ?? 0);
      const rate = totalPeople ? Math.round((compliantCount / totalPeople) * 100) : 0;
      let status = "red";
      if (rate >= 95) status = "green";
      else if (rate >= 85) status = "amber";
      return {
        home: home.home ?? "Unknown",
        complianceRate: rate,
        atRisk: Number(home.atRisk ?? 0),
        total: totalPeople,
        status,
      };
    });

    rag.sort((a, b) => b.atRisk - a.atRisk);

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: {
        generatedAt: new Date().toISOString(),
        complianceRate,
        totals: {
          assignments: total,
          overdue: Number(overall?.overdueCount ?? 0),
          due30: Number(overall?.due30Count ?? 0),
          due60: Number(overall?.due60Count ?? 0),
          due90: Number(overall?.due90Count ?? 0),
          avgDaysLate: overall?.avgDaysLate ? Math.round(Number(overall.avgDaysLate)) : 0,
        },
        ragByHome: rag,
        forecast,
        velocity,
        bottlenecks,
        distributionByHome,
        distributionByRole,
        repeatAttendance,
      },
    };
  } catch (error) {
    context.log.error("Reporting summary failed", error);
    context.res = {
      status: 500,
      body: { message: "Unable to load reporting summary", error: error?.message ?? String(error) },
    };
  }
};
