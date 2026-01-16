const { query } = require("../shared/db");
const { buildReportingWhereClause, getReportingFilters } = require("../shared/reportingFilters");

module.exports = async function (context, req) {
  try {
    const filters = getReportingFilters(req ?? context.req);
    const { clause, params } = buildReportingWhereClause(filters, {
      home: true,
      courseKeywords: true,
    });

    const byMonth = await query(
      `
      SELECT
        dueMonth,
        SUM(dueCount) AS dueCount,
        SUM(overdueCount) AS overdueCount
      FROM vw_training_due_forecast
      WHERE dueMonth >= DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1)
        AND dueMonth < DATEADD(month, 7, DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1))${clause}
      GROUP BY dueMonth
      ORDER BY dueMonth
      OPTION (RECOMPILE)
      `,
      params,
    );

    const byHome = await query(
      `
      SELECT
        homeLocation AS home,
        SUM(due30Count) AS due30,
        SUM(due60Count) AS due60,
        SUM(due90Count) AS due90
      FROM vw_training_due_forecast
      WHERE dueMonth >= DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1)
        AND dueMonth < DATEADD(month, 4, DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1))${clause}
      GROUP BY homeLocation
      ORDER BY homeLocation
      OPTION (RECOMPILE)
      `,
      params,
    );

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: {
        byMonth,
        byHome,
      },
    };
  } catch (error) {
    context.log.error("Reporting forecast failed", error);
    context.res = {
      status: 500,
      body: { message: "Unable to load forecast data", error: error?.message ?? String(error) },
    };
  }
};
