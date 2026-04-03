import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Role } from "../entities/Role";
import { Evidence } from "../entities/Evidence";
import { AuditLog } from "../entities/AuditLog";
import { AppUser } from "../entities/AppUser";
import { RecommendationSettings } from "../entities/RecommendationSettings";
import { logAudit } from "../services/auditLogger";
import { In } from "typeorm";
import { coerceRecommendationSettings, getRecommendationSettings } from "../services/recommendationSettings";
import { Assignment } from "../entities/Assignment";
import { TrainingRequirementSection } from "../entities/TrainingRequirementSection";
import { TrainingRequirementSuppression } from "../entities/TrainingRequirementSuppression";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { isNextDueRequirement } from "../services/requirementUtils";
import { getPlandayHeaders, plandayHrClient } from "../services/plandaySync";

const router = Router();

router.get("/roles", async (req, res) => {
  const roles = await AppDataSource.getRepository(Role).find();
  res.json({ roles });
});

router.get("/planday-fields", async (_req, res) => {
  try {
    const headers = await getPlandayHeaders();
    if (!headers.Authorization) {
      return res.json({ fields: [] });
    }

    // Custom fields are embedded on individual employee records as custom_XXXXX: { name, type, value }.
    // The bulk /employees endpoint strips them — fetch several employees individually to build a
    // complete union of all custom field definitions (not every employee has every field populated).
    const listResponse = await plandayHrClient.get<{ data: Array<{ id: number }> }>(
      "/employees",
      { headers, params: { limit: 20 } },
    );
    const ids = (listResponse.data?.data ?? []).map((e) => e.id).slice(0, 20);
    if (!ids.length) {
      return res.json({ fields: [] });
    }
    const seen = new Map<string, { id: string; name: string; dataType: string }>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await plandayHrClient.get<{ data: Record<string, any> }>(`/employees/${id}`, { headers });
          const emp = r.data?.data ?? {};
          for (const [key, val] of Object.entries(emp)) {
            if (!key.startsWith("custom_") || seen.has(key)) continue;
            if (val && typeof val === "object" && "name" in val) {
              seen.set(key, {
                id: key,
                name: String((val as any).name),
                dataType: String((val as any).type ?? "unknown"),
              });
            }
          }
        } catch { /* skip individual failures */ }
      }),
    );
    res.json({ fields: Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error: any) {
    console.warn("Unable to fetch Planday custom fields", error?.response?.status, error?.message);
    res.json({ fields: [] });
  }
});

const allowedAppRoles = new Set(["admin", "manager"]);

async function ensureAdminBootstrap(currentEmail?: string) {
  if (!currentEmail) {
    return;
  }
  const repo = AppDataSource.getRepository(AppUser);
  const count = await repo.count();
  if (count === 0) {
    await repo.save(repo.create({ email: currentEmail.toLowerCase(), role: "admin" }));
  }
}

router.get("/users/me", async (req, res) => {
  const email = req.user?.email?.toLowerCase() ?? "";
  await ensureAdminBootstrap(email);
  if (!email) {
    return res.json({ role: "staff" });
  }
  const repo = AppDataSource.getRepository(AppUser);
  const entry = await repo.findOne({ where: { email } });
  if (!entry) {
    return res.json({ role: "staff" });
  }
  return res.json({ role: entry.role });
});

router.get("/users", async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const repo = AppDataSource.getRepository(AppUser);
  const users = await repo.find({ order: { email: "ASC" } });
  res.json({ users });
});

router.post("/users", async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const role = String(req.body?.role ?? "").trim().toLowerCase();
  if (!email || !allowedAppRoles.has(role)) {
    return res.status(400).json({ message: "Invalid email or role" });
  }
  const repo = AppDataSource.getRepository(AppUser);
  const existing = await repo.findOne({ where: { email } });
  const roleValue = role as "admin" | "manager";
  const entry = existing
    ? repo.merge(existing, { role: roleValue })
    : repo.create({ email, role: roleValue });
  const saved = await repo.save(entry);
  res.json({ user: saved });
});

router.delete("/users/:id", async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const repo = AppDataSource.getRepository(AppUser);
  await repo.delete({ id: req.params.id });
  res.json({ ok: true });
});

router.get("/training-requirements", async (req, res) => {
  const repo = AppDataSource.getRepository(TrainingRequirement);
  const suppressionRepo = AppDataSource.getRepository(TrainingRequirementSuppression);
  const groupRepo = AppDataSource.getRepository(TrainingRequirementGroup);
  const suppressedEntries = await suppressionRepo.find();
  const suppressedNames = new Set(suppressedEntries.map((entry) => entry.name));
  const suppressedFieldIds = new Set(
    suppressedEntries.map((entry) => entry.fieldIdentifier).filter((value): value is string => Boolean(value)),
  );
  const requirements = (await repo.find({ relations: ["roles"] })).filter((requirement) => {
    const nameBlocked = suppressedNames.has(requirement.name);
    const fieldBlocked =
      requirement.fieldIdentifier && suppressedFieldIds.has(requirement.fieldIdentifier);
    return !nameBlocked && !fieldBlocked && !isNextDueRequirement(requirement.name);
  });

  const allGroups = await groupRepo.find({ relations: ["role"] });
  const groupsByReqId = new Map<string, typeof allGroups>();
  for (const group of allGroups) {
    const arr = groupsByReqId.get(group.requirementId) ?? [];
    arr.push(group);
    groupsByReqId.set(group.requirementId, arr);
  }

  const enriched = requirements.map((req) => {
    const groups = groupsByReqId.get(req.id) ?? [];
    const roleLevels: Record<number, any[]> = { 1: [], 2: [], 3: [] };
    if (groups.length > 0) {
      for (const group of groups) {
        if (group.role && roleLevels[group.requiredLevel] !== undefined) {
          roleLevels[group.requiredLevel].push(group.role);
        }
      }
    } else if (req.roles?.length) {
      // Backwards compat: no group rows yet — put all roles at the requirement's current level
      const level = (req as any).requiredLevel ?? 1;
      if (roleLevels[level]) {
        roleLevels[level] = req.roles as any[];
      }
    }
    return { ...req, roleLevels };
  });

  res.json({ requirements: enriched });
});

router.get("/training-requirement-sections", async (_req, res) => {
  const repo = AppDataSource.getRepository(TrainingRequirementSection);
  const sections = await repo.find({ order: { name: "ASC" } });
  res.json({ sections });
});

router.post("/training-requirement-sections", async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    return res.status(400).json({ message: "Section name is required" });
  }
  const repo = AppDataSource.getRepository(TrainingRequirementSection);
  const existing = await repo.findOne({ where: { name } });
  if (existing) {
    return res.status(409).json({ section: existing });
  }
  const section = repo.create({ name });
  const saved = await repo.save(section);
  res.status(201).json({ section: saved });
});

router.post("/training-requirements", async (req, res) => {
  const {
    name,
    description,
    validityPeriodMonths,
    roleExternalIds,
    roleLevels,
    requiredLevel,
    category,
    importanceLevel,
    minimumAttendees,
    enabled,
    section,
  } = req.body;

  if (!name || !description || !validityPeriodMonths) {
    return res.status(400).json({ message: "Name, description, and validity period are required" });
  }

  const roleRepo = AppDataSource.getRepository(Role);
  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const groupRepo = AppDataSource.getRepository(TrainingRequirementGroup);

  // Build flat roles list from roleLevels or legacy roleExternalIds
  let flatRoles: Role[] = [];
  if (roleLevels && typeof roleLevels === "object") {
    const allExternalIds = ([] as string[]).concat(...Object.values(roleLevels as Record<string, string[]>));
    if (allExternalIds.length) {
      flatRoles = await roleRepo.find({ where: { externalId: In(allExternalIds) } });
    }
  } else if (roleExternalIds?.length) {
    flatRoles = await roleRepo.find({ where: { externalId: In(roleExternalIds) } });
  }

  const requirement = requirementRepo.create({
    name,
    description,
    validityPeriodMonths,
    requiredLevel: requiredLevel ?? 1,
    category,
    importanceLevel: importanceLevel ?? 3,
    minimumAttendees: minimumAttendees ?? 8,
    enabled: enabled ?? true,
    roles: flatRoles,
    section: section || null,
  });

  await requirementRepo.save(requirement);

  // Create TrainingRequirementGroup rows when roleLevels provided
  if (roleLevels && typeof roleLevels === "object") {
    for (const [levelStr, externalIds] of Object.entries(roleLevels as Record<string, string[]>)) {
      const level = Number(levelStr);
      if (!Array.isArray(externalIds) || !externalIds.length) continue;
      const roles = await roleRepo.find({ where: { externalId: In(externalIds) } });
      for (const role of roles) {
        await groupRepo.save(groupRepo.create({ requirementId: requirement.id, roleId: role.id, requiredLevel: level }));
      }
    }
  }

  await logAudit({
    who: req.user?.email ?? "system",
    what: "training-requirement-created",
    why: `Created ${name}`,
  });

  res.status(201).json({ requirement });
});

router.put("/training-requirements/:id", async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    validityPeriodMonths,
    roleExternalIds,
    roleLevels,
    requiredLevel,
    category,
    importanceLevel,
    minimumAttendees,
    enabled,
    section,
    fieldIdentifier,
  } = req.body;

  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const roleRepo = AppDataSource.getRepository(Role);
  const groupRepo = AppDataSource.getRepository(TrainingRequirementGroup);
  const suppressionRepo = AppDataSource.getRepository(TrainingRequirementSuppression);

  const requirement = await requirementRepo.findOne({ where: { id }, relations: ["roles"] });
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  if (name !== undefined) requirement.name = name;
  if (description !== undefined) requirement.description = description;
  if (validityPeriodMonths !== undefined) requirement.validityPeriodMonths = Number(validityPeriodMonths);
  if (requiredLevel !== undefined) requirement.requiredLevel = Number(requiredLevel);
  if (category !== undefined) requirement.category = category || null;
  if (importanceLevel !== undefined) requirement.importanceLevel = Number(importanceLevel);
  if (minimumAttendees !== undefined) requirement.minimumAttendees = Number(minimumAttendees);
  if (enabled !== undefined) requirement.enabled = Boolean(enabled);
  if (fieldIdentifier !== undefined) requirement.fieldIdentifier = fieldIdentifier || null;

  if (roleLevels && typeof roleLevels === "object") {
    // Delete existing groups and rebuild from roleLevels
    await groupRepo.delete({ requirementId: id });
    const flatRoles: Role[] = [];
    for (const [levelStr, externalIds] of Object.entries(roleLevels as Record<string, string[]>)) {
      const level = Number(levelStr);
      if (!Array.isArray(externalIds) || !externalIds.length) continue;
      const roles = await roleRepo.find({ where: { externalId: In(externalIds) } });
      flatRoles.push(...roles);
      for (const role of roles) {
        await groupRepo.save(groupRepo.create({ requirementId: id, roleId: role.id, requiredLevel: level }));
      }
    }
    // Sync requirement.roles as union of all level roles
    const unique = Array.from(new Map(flatRoles.map((r) => [r.id, r])).values());
    requirement.roles = unique;
  } else if (Array.isArray(roleExternalIds)) {
    const roles = roleExternalIds.length
      ? await roleRepo.find({ where: { externalId: In(roleExternalIds) } })
      : [];
    requirement.roles = roles;
  }

  if (section !== undefined) {
    requirement.section = section || null;
  }

  if (requirement.fieldIdentifier) {
    await suppressionRepo.delete({ fieldIdentifier: requirement.fieldIdentifier });
  }
  await suppressionRepo.delete({ name: requirement.name });
  await requirementRepo.save(requirement);

  await logAudit({
    who: req.user?.email ?? "system",
    what: "training-requirement-updated",
    why: `Updated ${requirement.name}`,
  });

  res.json({ requirement });
});

router.delete("/training-requirements/:id", async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const { id } = req.params;
  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const evidenceRepo = AppDataSource.getRepository(Evidence);
  const suppressionRepo = AppDataSource.getRepository(TrainingRequirementSuppression);

  const requirement = await requirementRepo.findOne({ where: { id } });
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const assignments = await assignmentRepo.find({
    where: { requirement: { id } },
  });
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (assignmentIds.length) {
    await evidenceRepo
      .createQueryBuilder()
      .delete()
      .where("assignmentId IN (:...ids)", { ids: assignmentIds })
      .execute();
    await assignmentRepo
      .createQueryBuilder()
      .delete()
      .where("requirementId = :id", { id })
      .execute();
  }

  await suppressionRepo.delete({ name: requirement.name });
  if (requirement.fieldIdentifier) {
    await suppressionRepo.delete({ fieldIdentifier: requirement.fieldIdentifier });
  }
  await suppressionRepo.save(
    suppressionRepo.create({
      name: requirement.name,
      fieldIdentifier: requirement.fieldIdentifier ?? undefined,
    }),
  );
  await requirementRepo.delete({ id });

  await logAudit({
    who: req.user?.email ?? "system",
    what: "training-requirement-deleted",
    why: `Deleted ${requirement.name}`,
  });

  res.json({ ok: true });
});

router.get("/audit", async (req, res) => {
  const logs = await AppDataSource.getRepository(AuditLog).find({ order: { createdAt: "DESC" } });
  res.json({ logs });
});

router.get("/recommendation-settings", async (_req, res) => {
  const settings = await getRecommendationSettings();
  res.json({ settings });
});

router.put("/recommendation-settings", async (req, res) => {
  const repo = AppDataSource.getRepository(RecommendationSettings);
  const settings = await getRecommendationSettings();
  const updates = coerceRecommendationSettings(req.body ?? {});
  const merged = repo.merge(settings, updates);
  const saved = await repo.save(merged);
  res.json({ settings: saved });
});

router.post("/evidence/:evidenceId/approve", async (req, res) => {
  const { evidenceId } = req.params;
  const { approvedBy, confidenceOverride } = req.body;

  const evidenceRepo = AppDataSource.getRepository(Evidence);
  const evidence = await evidenceRepo.findOne({
    where: { id: evidenceId },
  });

  if (!evidence) {
    return res.status(404).json({ message: "Evidence not found" });
  }

  evidence.verifiedBy = approvedBy ?? evidence.verifiedBy;
  if (confidenceOverride !== undefined) {
    evidence.confidenceLevel = confidenceOverride;
  }

  await evidenceRepo.save(evidence);

  await logAudit({
    who: req.user?.email ?? "system",
    what: "evidence-approved",
    why: `Evidence ${evidence.id} approved via admin override`,
  });

  res.json({ evidence });
});

export default router;
