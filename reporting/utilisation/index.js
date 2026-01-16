const { query } = require("../shared/db");

module.exports = async function (context) {
  try {
    const sessions = await query(
      `
      SELECT
        sessionId,
        sessionName,
        sessionType,
        sessionDate,
        day,
        assignedCount,
        capacity,
        utilisationPct
      FROM vw_training_sessions_utilisation
      ORDER BY sessionDate DESC, day
      `,
    );

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: {
        sessions,
      },
    };
  } catch (error) {
    context.log.error("Reporting utilisation failed", error);
    context.res = {
      status: 500,
      body: { message: "Unable to load utilisation data" },
    };
  }
};
