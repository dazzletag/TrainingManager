const { query } = require("../shared/db");
const { buildReportingWhereClause, getReportingFilters } = require("../shared/reportingFilters");

function buildMatrix(rows) {
  const courseMap = new Map();
  const employeeMap = new Map();

  rows.forEach((row) => {
    if (!courseMap.has(row.requirementId)) {
      courseMap.set(row.requirementId, {
        id: row.requirementId,
        name: row.requirementName,
        requiredLevel: row.requiredLevel,
        isSctv: String(row.requirementName ?? "").toUpperCase().includes("SCTV"),
      });
    }

    if (!employeeMap.has(row.personId)) {
      employeeMap.set(row.personId, {
        id: row.personId,
        name: row.fullName,
        home: row.homeLocation,
        role: row.roleName,
        courses: {},
      });
    }

    const employee = employeeMap.get(row.personId);
    employee.courses[row.requirementId] = {
      expiryDate: row.nextDueDate,
      complianceStatus: row.complianceStatus,
    };
  });

  const courses = Array.from(courseMap.values()).sort((a, b) => {
    if (a.requiredLevel !== b.requiredLevel) {
      return a.requiredLevel - b.requiredLevel;
    }
    return String(a.name).localeCompare(String(b.name));
  });

  const employees = Array.from(employeeMap.values()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name)),
  );

  return { courses, employees };
}

module.exports = async function (context, req) {
  try {
    const filters = getReportingFilters(req ?? context.req);
    const { clause, params } = buildReportingWhereClause(filters, {
      home: true,
      roles: true,
    });

    const rows = await query(
      `
      SELECT
        personId,
        fullName,
        homeLocation,
        roleName,
        requirementId,
        requirementName,
        requiredLevel,
        nextDueDate,
        complianceStatus
      FROM vw_training_compliance_current
      WHERE mandatory = 1
        AND requiredLevel = 1
        AND UPPER(requirementName) LIKE '%SCTV%'${clause}
      ORDER BY fullName, requirementName
      OPTION (RECOMPILE)
      `,
      params,
    );

    const matrix = buildMatrix(rows);

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: matrix,
    };
  } catch (error) {
    context.log.error("Reporting matrix failed", error);
    context.res = {
      status: 500,
      body: { message: "Unable to load matrix report", error: error?.message ?? String(error) },
    };
  }
};
