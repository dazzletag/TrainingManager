function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getReportingFilters(req) {
  const query = req?.query ?? {};
  return {
    home: query.home ? String(query.home) : "",
    roles: parseCsv(query.roles),
    importance: parseCsv(query.importance),
    courseKeywords: parseCsv(query.courseKeywords).map((value) => value.toLowerCase()),
  };
}

function buildInClause(field, values, prefix, params) {
  if (!values.length) return "";
  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`;
    params[key] = value;
    return `@${key}`;
  });
  return `${field} IN (${placeholders.join(", ")})`;
}

function buildReportingWhereClause(filters, fields = {}) {
  const clauses = [];
  const params = {};

  if (fields.home && filters.home && filters.home.toLowerCase() !== "all") {
    params.home0 = filters.home;
    clauses.push("homeLocation = @home0");
  }

  if (fields.roles && filters.roles.length) {
    const clause = buildInClause("roleName", filters.roles, "role", params);
    if (clause) clauses.push(clause);
  }

  if (fields.importance && filters.importance.length) {
    const clause = buildInClause("requiredLevel", filters.importance, "importance", params);
    if (clause) clauses.push(clause);
  }

  if (fields.courseKeywords && filters.courseKeywords.length) {
    const keywordClauses = [];
    if (filters.courseKeywords.includes("sctv")) {
      params.keywordSctv = "%SCTV%";
      keywordClauses.push("UPPER(requirementName) LIKE @keywordSctv");
    }
    if (filters.courseKeywords.includes("competency")) {
      params.keywordCompetency = "%COMPETENCY%";
      keywordClauses.push("UPPER(requirementName) LIKE @keywordCompetency");
    }
    if (keywordClauses.length) {
      clauses.push(`(${keywordClauses.join(" OR ")})`);
    }
  }

  return {
    clause: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    params,
  };
}

module.exports = {
  getReportingFilters,
  buildReportingWhereClause,
};
