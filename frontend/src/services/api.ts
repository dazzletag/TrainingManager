import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://trainingmanager-backend.azurewebsites.net/api/v1";

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

export function submitEvidenceWithFile(personId: string, formData: FormData, role: string, email: string) {
  return apiClient.post(`/staff/${personId}/evidence/upload`, formData, {
    headers: { ...withHeaders(role, email), "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
}

export function getEvidenceFileUrl(evidenceId: string) {
  return `${BASE_URL}/staff/evidence/${evidenceId}/file`;
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

export function fetchRequirementSections(role: string, email: string) {
  return apiClient.get("/admin/training-requirement-sections", {
    headers: withHeaders(role, email),
  });
}

export function createRequirementSection(body: { name: string }, role: string, email: string) {
  return apiClient.post("/admin/training-requirement-sections", body, {
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

export function deleteTrainingRequirement(id: string, role: string, email: string) {
  return apiClient.delete(`/admin/training-requirements/${id}`, {
    headers: withHeaders(role, email),
  });
}

export function fetchAuditTrail(role: string, email: string) {
  return apiClient.get("/admin/audit", {
    headers: withHeaders(role, email),
  });
}

export function fetchRecommendationSettings(role: string, email: string) {
  return apiClient.get("/admin/recommendation-settings", {
    headers: withHeaders(role, email),
  });
}

export function updateRecommendationSettings(body: any, role: string, email: string) {
  return apiClient.put("/admin/recommendation-settings", body, {
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

export function fetchCurrentUserRole(email: string) {
  return apiClient.get("/admin/users/me", {
    headers: withHeaders("staff", email),
  });
}

export function fetchAdminUsers(role: string, email: string) {
  return apiClient.get("/admin/users", {
    headers: withHeaders(role, email),
  });
}

export function upsertAdminUser(body: { email: string; role: string }, role: string, email: string) {
  return apiClient.post("/admin/users", body, {
    headers: withHeaders(role, email),
  });
}

export function deleteAdminUser(id: string, role: string, email: string) {
  return apiClient.delete(`/admin/users/${id}`, {
    headers: withHeaders(role, email),
  });
}

export function fetchSchedulerOverview(role: string, email: string, params?: { requirementId?: string }) {
  return apiClient.get("/scheduler/overview", {
    headers: withHeaders(role, email),
    params,
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

export function markPersonUnavailable(body: { personId: string; reason?: string }, role: string, email: string) {
  return apiClient.post("/scheduler/unavailable", body, {
    headers: withHeaders(role, email),
  });
}

export function removePersonUnavailable(personId: string, role: string, email: string) {
  return apiClient.post(
    "/scheduler/unavailable/remove",
    { personId },
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

export function deleteTrainingSession(sessionId: string, role: string, email: string) {
  return apiClient.delete(`/scheduler/sessions/${sessionId}`, {
    headers: withHeaders(role, email),
  });
}

export function importPlandayShifts(role: string, email: string) {
  return apiClient.post(
    "/scheduler/sessions/import-planday",
    {},
    {
      headers: withHeaders(role, email),
      timeout: 60000,
    },
  );
}

export function recommendTrainingSession(sessionId: string, role: string, email: string) {
  return apiClient.post(
    `/scheduler/sessions/${sessionId}/recommend`,
    {},
    {
      headers: withHeaders(role, email),
    },
  );
}

export function fetchNextBestCourses(role: string, email: string, params?: { requiredLevel?: number }) {
  return apiClient.get("/recommendations/next-courses", {
    headers: withHeaders(role, email),
    params,
  });
}

export function fetchNextBestCourseEligible(courseId: string, role: string, email: string) {
  return apiClient.get(`/recommendations/next-courses/${courseId}/eligible`, {
    headers: withHeaders(role, email),
  });
}

export function fetchEmployeeWageHistory(externalId: string, role: string, email: string) {
  return apiClient.get(`/staff/employees/${externalId}/wage-history`, {
    headers: withHeaders(role, email),
  });
}

export function fetchEmployeeHistory(
  externalId: string,
  role: string,
  email: string,
  params?: { startDateTime?: string; endDateTime?: string },
) {
  return apiClient.get(`/staff/employees/${externalId}/history`, {
    headers: withHeaders(role, email),
    params,
  });
}
