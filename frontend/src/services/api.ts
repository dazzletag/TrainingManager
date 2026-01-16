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

export function fetchStaffDirectory(
  role: string,
  email: string,
  options?: { limit?: number; search?: string; home?: string; includeHomes?: boolean },
) {
  const params: Record<string, string | number | boolean> = {};
  if (options?.limit) params.limit = options.limit;
  if (options?.search) params.search = options.search;
  if (options?.home) params.home = options.home;
  if (options?.includeHomes) params.includeHomes = true;

  return apiClient.get("/staff/directory", {
    headers: withHeaders(role, email),
    params,
  });
}

export function submitEvidence(personId: string, payload: any, role: string, email: string) {
  return apiClient.post(`/staff/${personId}/evidence`, payload, {
    headers: withHeaders(role, email),
  });
}

export function fetchManagerCompliance(role: string, email: string, requirementName?: string) {
  return apiClient.get("/manager/compliance", {
    headers: withHeaders(role, email),
    params: requirementName ? { requirementName } : undefined,
  });
}

export function fetchManagerAtRisk(role: string, email: string, requirementName?: string) {
  return apiClient.get("/manager/at-risk", {
    headers: withHeaders(role, email),
    params: requirementName ? { requirementName } : undefined,
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

export function updateTrainingRequirement(id: string, body: any, role: string, email: string) {
  return apiClient.put(`/admin/training-requirements/${id}`, body, {
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

export function fetchSchedulerOverview(role: string, email: string) {
  return apiClient.get("/scheduler/overview", {
    headers: withHeaders(role, email),
  });
}

export function createTrainingSession(body: any, role: string, email: string) {
  return apiClient.post("/scheduler/sessions", body, {
    headers: withHeaders(role, email),
  });
}

export function assignPersonToSession(body: any, role: string, email: string) {
  return apiClient.post("/scheduler/assign", body, {
    headers: withHeaders(role, email),
  });
}

export function removeSessionAssignment(assignmentId: string, role: string, email: string) {
  return apiClient.post(
    "/scheduler/assign/remove",
    { assignmentId },
    {
      headers: withHeaders(role, email),
    },
  );
}

export function publishTrainingSession(sessionId: string, role: string, email: string) {
  return apiClient.post(
    `/scheduler/sessions/${sessionId}/publish`,
    {},
    {
      headers: withHeaders(role, email),
    },
  );
}
