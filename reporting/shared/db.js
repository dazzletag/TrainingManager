const sql = require("mssql");

let poolPromise = null;

function getConnectionString() {
  const conn = process.env.REPORTING_DB_CONNECTION_STRING;
  if (!conn) {
    throw new Error("REPORTING_DB_CONNECTION_STRING is not configured");
  }
  return conn;
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(getConnectionString());
  }
  return poolPromise;
}

async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });
  const result = await request.query(text);
  return result.recordset ?? [];
}

module.exports = {
  query,
};
