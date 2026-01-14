import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

function withHeaders(role: string, email: string) {
  return {
    "x-user-role": role,
    "x-user-email": email,
    "x-user-id": email,
    "x-user-name": email.split("@")[0],
  };
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

export function fetchStaffProfile(externalId: string, role: string, email: string) {
  return apiClient.get("/staff/profile", {
    headers: withHeaders(role, email),
    params: { externalId },
  });
}

export function submitEvidence(personId: string, payload: any, role: string, email: string) {
  return apiClient.post(`/staff/${personId}/evidence`, payload, {
    headers: withHeaders(role, email),
  });
}

export function fetchManagerCompliance(role: string, email: string) {
  return apiClient.get("/manager/compliance", {
    headers: withHeaders(role, email),
  });
}

export function fetchManagerAtRisk(role: string, email: string) {
  return apiClient.get("/manager/at-risk", {
    headers: withHeaders(role, email),
  });
}

export function fetchManagerEvidence(personId: string, role: string, email: string) {
  return apiClient.get(`/manager/evidence/${personId}`, {
    headers: withHeaders(role, email),
  });
}

export function fetchTrainingRequirements(role: string, email: string) {
  return apiClient.get("/admin/training-requirements", {
    headers: withHeaders(role, email),
  });
}

export function createTrainingRequirement(body: any, role: string, email: string) {
  return apiClient.post("/admin/training-requirements", body, {
    headers: withHeaders(role, email),
  });
}

export function fetchAuditTrail(role: string, email: string) {
  return apiClient.get("/admin/audit", {
    headers: withHeaders(role, email),
  });
}

export function approveEvidence(evidenceId: string, body: any, role: string, email: string) {
  return apiClient.post(`/admin/evidence/${evidenceId}/approve`, body, {
    headers: withHeaders(role, email),
  });
}

export function fetchRoles(role: string, email: string) {
  return apiClient.get("/admin/roles", {
    headers: withHeaders(role, email),
  });
}
