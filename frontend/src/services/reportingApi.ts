import axios from "axios";

const REPORTING_BASE_URL =
  import.meta.env.VITE_REPORTING_BASE_URL ?? "http://localhost:7071/api";

const reportingClient = axios.create({
  baseURL: REPORTING_BASE_URL,
  timeout: 20000,
});

export function fetchReportingSummary() {
  return reportingClient.get("/reporting/summary");
}

export function fetchReportingCompliance() {
  return reportingClient.get("/reporting/compliance");
}

export function fetchReportingForecast() {
  return reportingClient.get("/reporting/forecast");
}

export function fetchReportingUtilisation() {
  return reportingClient.get("/reporting/utilisation");
}
