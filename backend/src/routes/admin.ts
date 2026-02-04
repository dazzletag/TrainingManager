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

const router = Router();

router.get("/roles", async (req, res) => {
  const roles = await AppDataSource.getRepository(Role).find();
  res.json({ roles });
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
  const suppressedEntries = await suppressionRepo.find();
  const suppressedNames = new Set(suppressedEntries.map((entry) => entry.name));
  const suppressedFieldIds = new Set(
    suppressedEntries.map((entry) => entry.fieldIdentifier).filter((value): value is string => Boolean(value)),
  );
  const requirements = (await repo.find({ relations: ["roles"] })).filter((requirement) => {
    const nameBlocked = suppressedNames.has(requirement.name);
    const fieldBlocked =
      requirement.fieldIdentifier && suppressedFieldIds.has(requirement.fieldIdentifier);
    return !nameBlocked && !fieldBlocked;
  });
  res.json({ requirements });
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
  const suppressionRepo = AppDataSource.getRepository(TrainingRequirementSuppression);

  const roles = roleExternalIds?.length
    ? await roleRepo.find({ where: { externalId: In(roleExternalIds) } })
    : [];

  const requirement = requirementRepo.create({
    name,
    description,
    validityPeriodMonths,
    requiredLevel: requiredLevel ?? 1,
    category,
    importanceLevel: importanceLevel ?? 3,
    minimumAttendees: minimumAttendees ?? 8,
    enabled: enabled ?? true,
    roles,
    section: section || null,
  });

  await requirementRepo.save(requirement);

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
    requiredLevel,
    category,
    importanceLevel,
    minimumAttendees,
    enabled,
    section,
  } = req.body;

  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const roleRepo = AppDataSource.getRepository(Role);
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

  if (Array.isArray(roleExternalIds)) {
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

  if (requirement.fieldIdentifier) {
    await suppressionRepo.delete({ fieldIdentifier: requirement.fieldIdentifier });
  }
  await suppressionRepo.delete({ name: requirement.name });

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
