import axios from "axios";
import { AppDataSource } from "../db/data-source";
import { Role } from "../entities/Role";
import { Person } from "../entities/Person";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Assignment } from "../entities/Assignment";
import { Evidence } from "../entities/Evidence";

const plandayRefreshToken = process.env.PLANDAY_REFRESH_TOKEN ?? process.env.PLANDAY_API_TOKEN;
const plandayClientId = process.env.PLANDAY_CLIENT_ID;
const plandayTokenUrl = process.env.PLANDAY_TOKEN_URL ?? "https://id.planday.com/connect/token";
const plandayHrBaseUrl =
  process.env.PLANDAY_HR_API_URL ??
  process.env.PLANDAY_API_URL ??
  "https://openapi.planday.com/hr/v1.0";
const plandaySchedulingBaseUrl =
  process.env.PLANDAY_SCHEDULING_API_URL ?? "https://openapi.planday.com/scheduling/v1.0";

type CachedToken = { value: string; expiresAt: number };
let cachedAccessToken: CachedToken | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!plandayRefreshToken || !plandayClientId) {
    return null;
  }

  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.value;
  }

  const payload = new URLSearchParams({
    client_id: plandayClientId,
    grant_type: "refresh_token",
    refresh_token: plandayRefreshToken,
  });

  const response = await axios.post(plandayTokenUrl, payload.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const accessToken = response.data?.access_token as string | undefined;
  const expiresIn = Number(response.data?.expires_in ?? 0);
  if (!accessToken) {
    return null;
  }

  cachedAccessToken = {
    value: accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return accessToken;
}

export async function getPlandayHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const accessToken = await getAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (plandayClientId) {
    headers["X-ClientId"] = plandayClientId;
  }
  return headers;
}

const plandayPayBaseUrl =
  process.env.PLANDAY_PAY_API_URL ?? "https://openapi.planday.com/pay/v1.0";

const hrClient = axios.create({
  baseURL: plandayHrBaseUrl,
  timeout: 15000,
});

const schedulingClient = axios.create({
  baseURL: plandaySchedulingBaseUrl,
  timeout: 15000,
});

const payClient = axios.create({
  baseURL: plandayPayBaseUrl,
  timeout: 15000,
});

export { hrClient as plandayHrClient, schedulingClient as plandaySchedulingClient, payClient as plandayPayClient };

interface PlandayEmployeeGroup {
  id: string;
  name: string;
  category: string;
  description?: string;
}

interface PlandayEmployee {
  id: string;
  fullName: string;
  email: string;
  employmentStatus: string;
  homeLocation: string;
  roleId?: string;
  employeeGroups?: Array<{ id?: number | string } | number | string>;
  employeeGroupIds?: Array<number | string>;
}

function extractEmployeeGroupIds(employee: PlandayEmployee): string[] {
  const ids: string[] = [];
  const rawGroups = employee.employeeGroups ?? employee.employeeGroupIds ?? [];
  for (const item of rawGroups) {
    if (item === undefined || item === null) continue;
    if (typeof item === "number" || typeof item === "string") {
      ids.push(String(item));
      continue;
    }
    if (typeof item === "object" && "id" in item && item.id !== undefined && item.id !== null) {
      ids.push(String(item.id));
    }
  }
  return ids;
}

async function syncPlandayEvidenceForPerson(
  person: Person,
  employeeId: string,
  headers: Record<string, string>,
  mappedRequirements: TrainingRequirement[],
): Promise<void> {
  let empData: Record<string, any>;
  try {
    const r = await hrClient.get<{ data: Record<string, any> }>(`/employees/${employeeId}`, { headers });
    empData = r.data?.data ?? {};
  } catch {
    return;
  }

  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const evidenceRepo = AppDataSource.getRepository(Evidence);

  for (const requirement of mappedRequirements) {
    const fieldId = requirement.fieldIdentifier!;
    const fieldVal = empData[fieldId];
    if (!fieldVal || typeof fieldVal !== "object") continue;

    const rawDate = fieldVal.value;
    if (!rawDate || typeof rawDate !== "string") continue;

    const validFrom = new Date(rawDate);
    if (isNaN(validFrom.getTime())) continue;

    const validTo = new Date(validFrom);
    validTo.setMonth(validTo.getMonth() + (requirement.validityPeriodMonths ?? 12));

    // Find or create assignment
    let assignment = await assignmentRepo.findOne({
      where: { person: { id: person.id }, requirement: { id: requirement.id } },
      loadEagerRelations: false,
    });
    if (!assignment) {
      assignment = await assignmentRepo.save(
        assignmentRepo.create({ person, requirement }),
      );
    }

    // Find existing planday evidence for this assignment, update if date changed
    const existing = await evidenceRepo.findOne({
      where: { assignment: { id: assignment.id }, source: "planday" },
      loadEagerRelations: false,
    });

    if (existing) {
      const sameDate = existing.validFrom.toISOString().startsWith(rawDate);
      if (!sameDate) {
        existing.validFrom = validFrom;
        existing.validTo = validTo;
        await evidenceRepo.save(existing);
      }
    } else {
      await evidenceRepo.save(
        evidenceRepo.create({
          assignment,
          source: "planday",
          type: "planday-sync",
          validFrom,
          validTo,
          verifiedBy: "planday-sync",
          confidenceLevel: 85,
        }),
      );
    }
  }
}

export async function syncPlandayData(): Promise<void> {
  if (!plandayRefreshToken || !plandayClientId) {
    console.warn("Planday refresh token or client id not configured, skipping sync");
    return;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    const headers = await getPlandayHeaders();
    if (!headers.Authorization) {
      throw new Error("Planday access token unavailable");
    }

    const [groupsResponse, employeesResponse] = await Promise.all([
      hrClient.get<{ data: PlandayEmployeeGroup[] }>("/employeegroups", { headers }),
      hrClient.get<{ data: PlandayEmployee[] }>("/employees", { headers }),
    ]);

    const roleRepo = AppDataSource.getRepository(Role);

    const remoteRoles = groupsResponse.data.data;
    const mappedRoles = new Map<string, Role>();

    for (const remoteRole of remoteRoles) {
      const roleExternalId = String(remoteRole.id);
      const existing = await roleRepo.findOneBy({ externalId: roleExternalId });
      const role = await roleRepo.save(
        roleRepo.create({
          id: existing?.id,
          externalId: roleExternalId,
          name: remoteRole.name,
          category: remoteRole.category ?? "Imported",
          description: remoteRole.description ?? "Imported from Planday",
        }),
      );
      mappedRoles.set(roleExternalId, role);
    }

    // Load requirements that have a Planday field mapping — used for evidence sync
    const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
    const mappedRequirements = (await requirementRepo.find()).filter(
      (r) => r.fieldIdentifier && r.fieldIdentifier.startsWith("custom_"),
    );

    const employeeRepo = AppDataSource.getRepository(Person);
    const evidenceSyncQueue: Array<{ person: Person; employeeId: string }> = [];

    for (const employee of employeesResponse.data.data) {
      const candidateRoles = extractEmployeeGroupIds(employee)
        .map((groupId) => mappedRoles.get(groupId))
        .filter((entry): entry is Role => Boolean(entry));
      const role =
        candidateRoles[0] ?? (employee.roleId ? mappedRoles.get(String(employee.roleId)) : undefined);
      if (!role) {
        console.warn("Skipping employee with unknown role", employee.id);
        continue;
      }

      const existing = await employeeRepo.findOne({ where: { externalId: String(employee.id) }, loadEagerRelations: false });
      const savedPerson = await employeeRepo.save(
        employeeRepo.create({
          id: existing?.id,
          externalId: String(employee.id),
          fullName: employee.fullName,
          email: employee.email,
          employmentStatus: employee.employmentStatus ?? "Active",
          homeLocation: employee.homeLocation,
          role,
          isActive: (employee.employmentStatus ?? "Active").toLowerCase() === "active",
        }),
      );

      if (mappedRequirements.length > 0) {
        evidenceSyncQueue.push({ person: savedPerson, employeeId: String(employee.id) });
      }
    }

    // Run evidence syncs sequentially in the background after main loop, 500ms apart
    if (evidenceSyncQueue.length > 0) {
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // wait 5s for server to settle
        for (const { person, employeeId } of evidenceSyncQueue) {
          await syncPlandayEvidenceForPerson(person, employeeId, headers, mappedRequirements)
            .catch((err) => console.error(`Evidence sync failed for ${person.fullName}:`, err));
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        console.log(`Evidence sync complete for ${evidenceSyncQueue.length} employees`);
      })();
    }
  } catch (error) {
    console.error("Planday sync failed", error);
    throw error;
  }
}
