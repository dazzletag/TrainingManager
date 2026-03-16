import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { Assignment } from "../entities/Assignment";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { Person } from "../entities/Person";
import { Evidence } from "../entities/Evidence";
import { evaluateRequirement } from "../services/complianceService";
import { logAudit } from "../services/auditLogger";
import { In } from "typeorm";
import { dedupeRequirementCompliance } from "../services/requirementUtils";
import { getPlandayHeaders, plandayHrClient, plandayPayClient } from "../services/plandaySync";

const router = Router();

function resolveRequirementMeta(
  requirement: TrainingRequirement,
  groupMeta?: { requiredLevel: number },
): TrainingRequirement {
  if (!groupMeta) {
    return requirement;
  }
  return Object.assign({}, requirement, {
    requiredLevel: groupMeta.requiredLevel,
  });
}

async function buildRequirementMetaMap(groupIds: string[]) {
  if (!groupIds.length) {
    return new Map<string, { requiredLevel: number }>();
  }
  const repo = AppDataSource.getRepository(TrainingRequirementGroup);
  const links = await repo.find({
    where: { roleId: In(groupIds) },
  });
  const metaMap = new Map<string, { requiredLevel: number }>();
  for (const link of links) {
    const existing = metaMap.get(link.requirementId);
    if (!existing) {
      metaMap.set(link.requirementId, {
        requiredLevel: link.requiredLevel,
      });
      continue;
    }
    metaMap.set(link.requirementId, {
      requiredLevel: Math.min(existing.requiredLevel, link.requiredLevel),
    });
  }
  return metaMap;
}

router.get("/directory", async (req, res) => {
  const limitRaw = req.query.limit as string | undefined;
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 10;
  const limit = Math.min(Math.max(Number.isFinite(limitParsed) ? limitParsed : 10, 1), 2000);
  const home = (req.query.home as string | undefined)?.trim() || undefined;
  const searchRaw = (req.query.search as string | undefined)?.trim() || undefined;
  const includeHomes = req.query.includeHomes === "true";

  const personRepo = AppDataSource.getRepository(Person);
  const query = personRepo
    .createQueryBuilder("person")
    .select([
      "person.id",
      "person.externalId",
      "person.fullName",
      "person.email",
      "person.employmentStatus",
      "person.homeLocation",
    ])
    .orderBy("person.fullName", "ASC")
    .take(limit);

  if (home) {
    query.andWhere("person.homeLocation = :home", { home });
  }

  if (searchRaw) {
    const search = `%${searchRaw}%`;
    query.andWhere(
      "(person.fullName LIKE :search OR person.email LIKE :search OR person.externalId LIKE :search)",
      { search },
    );
  }

  const people = await query.getMany();
  const sortedPeople = [...people].sort((a, b) => {
    const aLast = a.fullName?.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const bLast = b.fullName?.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const lastCompare = aLast.localeCompare(bLast);
    if (lastCompare !== 0) return lastCompare;
    return (a.fullName ?? "").localeCompare(b.fullName ?? "");
  });

  let homes: string[] | undefined;
  if (includeHomes) {
    const homeRows = await personRepo
      .createQueryBuilder("person")
      .select("DISTINCT person.homeLocation", "homeLocation")
      .where("person.homeLocation IS NOT NULL AND person.homeLocation <> ''")
      .orderBy("person.homeLocation", "ASC")
      .getRawMany();
    homes = homeRows.map((row) => row.homeLocation).filter(Boolean);
  }

  res.json({ people: sortedPeople, homes });
});

router.get("/profile", async (req, res) => {
  const externalId = req.query.externalId as string | undefined;
  const email = req.query.email as string | undefined;

  if (!externalId && !email) {
    return res.status(400).json({ message: "externalId or email is required" });
  }

  const personRepo = AppDataSource.getRepository(Person);
  const person = await personRepo.findOne({
    where: externalId ? { externalId } : { email },
    relations: {
      role: true,
      groups: true,
      assignments: {
        evidence: true,
      },
    },
  });

  if (!person) {
    return res.status(404).json({ message: "Person not found" });
  }

  const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
  const requirementList = (person.assignments ?? []).map((assignment) => assignment.requirement);
  const groupIds = person.groups?.map((group) => group.id) ?? [];

  const [requirementMeta, plandayEmployee] = await Promise.all([
    buildRequirementMetaMap(groupIds),
    (async () => {
      try {
        const headers = await getPlandayHeaders();
        if (!headers.Authorization) return null;
        const response = await plandayHrClient.get(`/employees/${person.externalId}`, {
          headers,
          params: { special: "BirthDate" },
        });
        return response.data?.data ?? response.data ?? null;
      } catch {
        return null;
      }
    })(),
  ]);

  const requirements = requirementList.map((requirement) =>
    evaluateRequirement(
      resolveRequirementMeta(requirement, requirementMeta.get(requirement.id)),
      assignmentMap.get(requirement.id),
    ),
  );
  const dedupedRequirements = dedupeRequirementCompliance(requirements);

  res.json({
    person: {
      id: person.id,
      name: person.fullName,
      email: person.email,
      role: person.role.name,
      homeLocation: person.homeLocation,
      dateOfBirth: plandayEmployee?.birthDate ?? plandayEmployee?.dateOfBirth ?? null,
      hiredDate: plandayEmployee?.hiredFrom ?? plandayEmployee?.hiredDate ?? plandayEmployee?.startDate ?? plandayEmployee?.employedFrom ?? null,
    },
    requirements: dedupedRequirements,
  });
});

router.get("/:personId/requirements", async (req, res) => {
  const personId = req.params.personId;
  const personRepo = AppDataSource.getRepository(Person);

  const person = await personRepo.findOne({
    where: { id: personId },
    relations: {
      role: true,
      groups: true,
      assignments: {
        evidence: true,
      },
    },
  });

  if (!person) {
    return res.status(404).json({ message: "Person not found" });
  }

  const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
  const requirementList = (person.assignments ?? []).map((assignment) => assignment.requirement);
  const groupIds = person.groups?.map((group) => group.id) ?? [];
  const requirementMeta = await buildRequirementMetaMap(groupIds);
  const requirements = requirementList.map((requirement) =>
    evaluateRequirement(
      resolveRequirementMeta(requirement, requirementMeta.get(requirement.id)),
      assignmentMap.get(requirement.id),
    ),
  );
  const dedupedRequirements = dedupeRequirementCompliance(requirements);

  res.json({
    person: {
      id: person.id,
      name: person.fullName,
      email: person.email,
      role: person.role.name,
      homeLocation: person.homeLocation,
    },
    requirements: dedupedRequirements,
  });
});

router.post("/:personId/evidence", async (req, res) => {
  const personId = req.params.personId;
  const {
    requirementId,
    type,
    source,
    validFrom,
    validTo,
    uploadedFileKey,
    verifiedBy,
    confidenceLevel,
  } = req.body;

  const missing = ["requirementId", "type", "source", "validFrom", "validTo", "verifiedBy"].filter(
    (f) => !req.body[f],
  );
  if (missing.length > 0) {
    return res.status(400).json({ message: `Missing required evidence fields: ${missing.join(", ")}` });
  }

  const personRepo = AppDataSource.getRepository(Person);
  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);

  const person = await personRepo.findOne({ where: { id: personId } });
  const requirement = await requirementRepo.findOne({ where: { id: requirementId } });

  if (!person || !requirement) {
    return res.status(404).json({ message: "Person or requirement not found" });
  }

  const assignmentRepo = AppDataSource.getRepository(Assignment);
  let assignment = await assignmentRepo.findOne({
    where: {
      person: { id: personId },
      requirement: { id: requirementId },
    },
  });

  if (!assignment) {
    assignment = await assignmentRepo.save(
      assignmentRepo.create({
        person,
        requirement,
      }),
    );
  }

  const evidenceRepo = AppDataSource.getRepository(Evidence);
  const evidence = await evidenceRepo.save(
    evidenceRepo.create({
      assignment,
      type,
      source,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      uploadedFileKey,
      verifiedBy,
      confidenceLevel: confidenceLevel ?? 0,
    }),
  );

  await logAudit({
    who: req.user?.email ?? "system",
    what: "evidence-upload",
    why: `Evidence for ${requirement.name} by ${req.user?.email ?? "system"}`,
  });

  res.status(201).json({ evidence });
});

const LOOKUP_TTL_MS = 60 * 60 * 1000; // 1 hour

type EmployeeType = { id: number; name: string; description?: string };
let cachedEmployeeTypes: Map<number, string> | null = null;
let employeeTypesCachedAt = 0;

async function getEmployeeTypeMap(headers: Record<string, string>): Promise<Map<number, string>> {
  if (cachedEmployeeTypes && Date.now() - employeeTypesCachedAt < LOOKUP_TTL_MS) {
    return cachedEmployeeTypes;
  }
  const response = await plandayHrClient.get<{ data: EmployeeType[] }>("/employeetypes", { headers });
  const map = new Map<number, string>(
    (response.data.data ?? []).map((t) => [t.id, t.name]),
  );
  cachedEmployeeTypes = map;
  employeeTypesCachedAt = Date.now();
  return map;
}

type Department = { id: number; name: string; number?: string };
let cachedDepartments: Map<number, string> | null = null;
let departmentsCachedAt = 0;

async function getDepartmentMap(headers: Record<string, string>): Promise<Map<number, string>> {
  if (cachedDepartments && Date.now() - departmentsCachedAt < LOOKUP_TTL_MS) {
    return cachedDepartments;
  }
  const response = await plandayHrClient.get<{ data: Department[] }>("/departments", { headers });
  const map = new Map<number, string>(
    (response.data.data ?? []).map((d) => [d.id, d.name]),
  );
  cachedDepartments = map;
  departmentsCachedAt = Date.now();
  return map;
}

router.get("/employees/:externalId/wage-history", async (req, res) => {
  const { externalId } = req.params;

  try {
    const headers = await getPlandayHeaders();
    if (!headers.Authorization) {
      return res.status(503).json({ message: "Planday integration not configured" });
    }

    // Fetch the employee from Planday to get their current group memberships
    const employeeResponse = await plandayHrClient.get(`/employees/${externalId}`, { headers });
    const plandayEmployee = employeeResponse.data?.data ?? employeeResponse.data;

    const rawGroups: Array<number | string> = [];
    const eg = plandayEmployee?.employeeGroups ?? plandayEmployee?.employeeGroupIds ?? [];
    for (const item of eg) {
      if (item === null || item === undefined) continue;
      if (typeof item === "number" || typeof item === "string") {
        rawGroups.push(item);
      } else if (typeof item === "object" && item.id != null) {
        rawGroups.push(item.id);
      }
    }

    const groupExternalIds = Array.from(new Set(rawGroups.map(String).filter(Boolean)));

    const results = await Promise.allSettled(
      groupExternalIds.map((groupId) =>
        plandayPayClient.get(
          `/payrates/employeeGroups/${groupId}/employees/${externalId}/history`,
          { headers },
        ),
      ),
    );

    const allEntries = results.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const body = result.value.data;
      const entries = body?.data ?? body;
      return Array.isArray(entries) ? entries : [];
    });

    allEntries.sort((a: any, b: any) => {
      const aDate = a.validFrom ? Date.parse(a.validFrom) : 0;
      const bDate = b.validFrom ? Date.parse(b.validFrom) : 0;
      return bDate - aDate;
    });

    res.json(allEntries);
  } catch (error: any) {
    if (error.response?.status === 404) {
      return res.status(404).json({ message: "Employee not found in Planday" });
    }
    console.error("Planday wage history fetch failed", error);
    res.status(500).json({ message: "Unable to fetch wage history" });
  }
});

router.get("/employees/:externalId/history", async (req, res) => {
  const { externalId } = req.params;
  const { startDateTime, endDateTime, offset, limit } = req.query;

  try {
    const headers = await getPlandayHeaders();
    if (!headers.Authorization) {
      return res.status(503).json({ message: "Planday integration not configured" });
    }

    const params: Record<string, unknown> = { limit: limit ?? 50, offset: offset ?? 0 };
    if (startDateTime) params.startDateTime = startDateTime;
    if (endDateTime) params.endDateTime = endDateTime;

    const [historyResponse, employeeTypeMap, departmentMap] = await Promise.all([
      plandayHrClient.get(`/employees/${externalId}/history`, { headers, params }),
      getEmployeeTypeMap(headers),
      getDepartmentMap(headers),
    ]);

    const data = (historyResponse.data.data ?? []).map((entry: any) => {
      if (typeof entry.path !== "string" || entry.value === undefined || entry.value === null) {
        return entry;
      }
      const pathLower = entry.path.toLowerCase();
      if (pathLower.includes("employeetypeid")) {
        const resolved = employeeTypeMap.get(Number(entry.value));
        if (resolved) return { ...entry, value: resolved };
      }
      if (pathLower.includes("department")) {
        const resolved = departmentMap.get(Number(entry.value));
        if (resolved) return { ...entry, value: resolved };
      }
      return entry;
    });

    res.json({ ...historyResponse.data, data });
  } catch (error: any) {
    if (error.response?.status === 404) {
      return res.status(404).json({ message: "Employee not found in Planday" });
    }
    console.error("Planday history fetch failed", error);
    res.status(500).json({ message: "Unable to fetch employee history" });
  }
});

export default router;
