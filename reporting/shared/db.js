const sql = require("mssql");

let poolPromise = null;

function parseConnectionString(connectionString) {
  const parts = connectionString.split(";").filter(Boolean);
  const map = {};
  parts.forEach((part) => {
    const [key, ...rest] = part.split("=");
    if (!key) return;
    map[key.trim().toLowerCase()] = rest.join("=").trim();
  });

  const serverValue =
    map.server ||
    map["data source"] ||
    map.addr ||
    map.address ||
    map["network address"];
  if (!serverValue) {
    throw new Error("Database server is missing in connection string");
  }

  const serverParts = serverValue.replace(/^tcp:/i, "").split(",");
  const server = serverParts[0];
  const port = serverParts[1] ? Number(serverParts[1]) : 1433;

  return {
    server,
    port,
    database: map.database || map["initial catalog"],
    user: map["user id"] || map.uid || map.user,
    password: map.password || map.pwd,
    options: {
      encrypt: map.encrypt ? map.encrypt.toLowerCase() === "true" : true,
      trustServerCertificate: map.trustservercertificate
        ? map.trustservercertificate.toLowerCase() === "true"
        : false,
      enableArithAbort: true,
    },
    requestTimeout: 60000,
    connectionTimeout: 30000,
  };
}

function getConnectionConfig() {
  const direct = process.env.REPORTING_DB_CONNECTION_STRING;
  if (direct && !direct.includes("@Microsoft.KeyVault")) {
    const parsed = parseConnectionString(direct);
    return {
      ...parsed,
      requestTimeout: 30000,
      connectionTimeout: 30000,
    };
  }

  const host = process.env.DB_HOST;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  if (!host || !name || !user || !password) {
    throw new Error("Database connection settings are not configured");
  }

  return {
    server: host,
    port: 1433,
    database: name,
    user,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    requestTimeout: 60000,
    connectionTimeout: 30000,
  };
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(getConnectionConfig()).connect();
  }
  return poolPromise;
}

async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  request.timeout = 60000;
  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });
  const result = await request.query(text);
  return result.recordset ?? [];
}

module.exports = {
  query,
};
