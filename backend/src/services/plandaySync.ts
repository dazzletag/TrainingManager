import axios from "axios";
import { AppDataSource } from "../db/data-source";
import { Role } from "../entities/Role";
import { Person } from "../entities/Person";

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

    const employeeRepo = AppDataSource.getRepository(Person);
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

      const existing = await employeeRepo.findOneBy({ externalId: String(employee.id) });
      await employeeRepo.save(
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
    }
  } catch (error) {
    console.error("Planday sync failed", error);
    throw error;
  }
}
