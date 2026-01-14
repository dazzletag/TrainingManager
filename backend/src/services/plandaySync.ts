import axios from "axios";
import { AppDataSource } from "../db/data-source";
import { Role } from "../entities/Role";
import { Person } from "../entities/Person";

const plandayBaseUrl = process.env.PLANDAY_API_URL ?? "https://api.planday.com";
const plandayToken = process.env.PLANDAY_API_TOKEN;

const httpClient = axios.create({
  baseURL: plandayBaseUrl,
  timeout: 15000,
  headers: plandayToken ? { Authorization: `Bearer ${plandayToken}` } : {},
});
export { httpClient as plandayClient };

interface PlandayRole {
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
  roleId: string;
}

export async function syncPlandayData(): Promise<void> {
  if (!plandayToken) {
    console.warn("Planday token not configured, skipping sync");
    return;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    const [rolesResponse, employeesResponse] = await Promise.all([
      httpClient.get<{ data: PlandayRole[] }>("/roles"),
      httpClient.get<{ data: PlandayEmployee[] }>("/employees"),
    ]);

    const roleRepo = AppDataSource.getRepository(Role);

    const remoteRoles = rolesResponse.data.data;
    const mappedRoles = new Map<string, Role>();

    for (const remoteRole of remoteRoles) {
      const existing = await roleRepo.findOneBy({ externalId: remoteRole.id });
      const role = await roleRepo.save(
        roleRepo.create({
          id: existing?.id,
          externalId: remoteRole.id,
          name: remoteRole.name,
          category: remoteRole.category,
          description: remoteRole.description ?? "Imported from Planday",
        }),
      );
      mappedRoles.set(remoteRole.id, role);
    }

    const employeeRepo = AppDataSource.getRepository(Person);
    for (const employee of employeesResponse.data.data) {
      const role = mappedRoles.get(employee.roleId);
      if (!role) {
        console.warn("Skipping employee with unknown role", employee.id);
        continue;
      }

      const existing = await employeeRepo.findOneBy({ externalId: employee.id });
      await employeeRepo.save(
        employeeRepo.create({
          id: existing?.id,
          externalId: employee.id,
          fullName: employee.fullName,
          email: employee.email,
          employmentStatus: employee.employmentStatus,
          homeLocation: employee.homeLocation,
          role,
          isActive: employee.employmentStatus.toLowerCase() === "active",
        }),
      );
    }
  } catch (error) {
    console.error("Planday sync failed", error);
    throw error;
  }
}
