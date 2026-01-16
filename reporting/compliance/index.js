const { query } = require("../shared/db");

module.exports = async function (context) {
  try {
    const byHome = await query(
      `
      SELECT
        homeLocation AS home,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN complianceStatus = 'missing' THEN 1 ELSE 0 END) AS missing
      FROM vw_training_compliance_current
      WHERE mandatory = 1
      GROUP BY homeLocation
      ORDER BY homeLocation
      `,
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
      WHERE mandatory = 1
      GROUP BY roleName, roleCategory
      ORDER BY roleName
      `,
    );

    const byCourse = await query(
      `
      SELECT
        requirementName,
        COUNT(*) AS total,
        SUM(CASE WHEN complianceStatus = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN complianceStatus = 'overdue' THEN 1 ELSE 0 END) AS overdue
      FROM vw_training_compliance_current
      WHERE mandatory = 1
      GROUP BY requirementName
      ORDER BY requirementName
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
      },
    };
  } catch (error) {
    context.log.error("Reporting compliance failed", error);
    context.res = {
      status: 500,
      body: { message: "Unable to load compliance breakdown" },
    };
  }
};
