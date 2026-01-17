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

    const byHome = await query(
      `
      SELECT
        homeLocation AS home,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN complianceStatus = 'missing' THEN 1 ELSE 0 END) AS missing
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY homeLocation
      ORDER BY homeLocation
      OPTION (RECOMPILE)
      `,
      params,
    );

    const byRole = await query(
      `
      SELECT
        roleName,
        roleCategory,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdue
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY roleName, roleCategory
      ORDER BY roleName
      OPTION (RECOMPILE)
      `,
      params,
    );

    const byCourse = await query(
      `
      SELECT
        requirementName,
        requiredLevel,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdue
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1${clause}
      GROUP BY requirementName, requiredLevel
      ORDER BY requirementName
      OPTION (RECOMPILE)
      `,
      params,
    );

    const metaHomes = await query(
      `
      SELECT DISTINCT homeLocation AS home
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1
      ORDER BY homeLocation
      `,
    );

    const metaRoles = await query(
      `
      SELECT DISTINCT roleName
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1
      ORDER BY roleName
      `,
    );

    const metaImportance = await query(
      `
      SELECT DISTINCT requiredLevel
      FROM vw_training_compliance_current
      WHERE requiredLevel = 1
      ORDER BY requiredLevel
      `,
    );

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: {
        byHome,
        byRole,
        byCourse,
        meta: {
          homes: metaHomes.map((row) => row.home).filter(Boolean),
          roles: metaRoles.map((row) => row.roleName).filter(Boolean),
          importanceLevels: metaImportance.map((row) => row.requiredLevel).filter(Boolean),
        },
      },
    };
  } catch (error) {
    context.log.error("Reporting compliance failed", error);
    context.res = {
      status: 500,
      body: { message: "Unable to load compliance breakdown", error: error?.message ?? String(error) },
    };
  }
};
