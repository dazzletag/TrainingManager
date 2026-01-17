import axios from "axios";

const REPORTING_BASE_URL =
  import.meta.env.VITE_REPORTING_BASE_URL ?? "https://trainingmanager-reporting.azurewebsites.net/api";

const reportingClient = axios.create({
  baseURL: REPORTING_BASE_URL,
  timeout: 20000,
});

export type ReportingFilters = {
  home?: string;
  roles?: string[];
  importance?: string[];
  courseKeywords?: string[];
};

function buildParams(filters?: ReportingFilters) {
  if (!filters) return undefined;
  const params: Record<string, string> = {};
  if (filters.home) params.home = filters.home;
  if (filters.roles?.length) params.roles = filters.roles.join(",");
  if (filters.importance?.length) params.importance = filters.importance.join(",");
  if (filters.courseKeywords?.length) params.courseKeywords = filters.courseKeywords.join(",");
  return params;
}

export function fetchReportingSummary(filters?: ReportingFilters) {
  return reportingClient.get("/reporting/summary", { params: buildParams(filters) });
}

export function fetchReportingCompliance(filters?: ReportingFilters) {
  return reportingClient.get("/reporting/compliance", { params: buildParams(filters) });
}

export function fetchReportingForecast(filters?: ReportingFilters) {
  return reportingClient.get("/reporting/forecast", { params: buildParams(filters) });
}

export function fetchReportingUtilisation(filters?: ReportingFilters) {
  return reportingClient.get("/reporting/utilisation", { params: buildParams(filters) });
}

export function fetchReportingMatrix(filters?: ReportingFilters) {
  return reportingClient.get("/reporting/matrix", { params: buildParams(filters) });
}
