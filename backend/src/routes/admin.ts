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
  const requirements = await repo.find({ relations: ["roles"] });
  res.json({ requirements });
});

router.post("/training-requirements", async (req, res) => {
  const {
    name,
    description,
    validityPeriodMonths,
    mandatory,
    roleExternalIds,
    requiredLevel,
    category,
    importanceLevel,
    minimumAttendees,
    enabled,
  } = req.body;

  if (!name || !description || !validityPeriodMonths) {
    return res.status(400).json({ message: "Name, description, and validity period are required" });
  }

  const roleRepo = AppDataSource.getRepository(Role);
  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);

  const roles = roleExternalIds?.length
    ? await roleRepo.find({ where: { externalId: In(roleExternalIds) } })
    : [];

  const requirement = requirementRepo.create({
    name,
    description,
    validityPeriodMonths,
    mandatory: mandatory ?? true,
    requiredLevel: requiredLevel ?? (mandatory === false ? 2 : 1),
    category,
    importanceLevel: importanceLevel ?? 3,
    minimumAttendees: minimumAttendees ?? 8,
    enabled: enabled ?? true,
    roles,
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
    mandatory,
    roleExternalIds,
    requiredLevel,
    category,
    importanceLevel,
    minimumAttendees,
    enabled,
  } = req.body;

  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const roleRepo = AppDataSource.getRepository(Role);

  const requirement = await requirementRepo.findOne({ where: { id }, relations: ["roles"] });
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  if (name !== undefined) requirement.name = name;
  if (description !== undefined) requirement.description = description;
  if (validityPeriodMonths !== undefined) requirement.validityPeriodMonths = Number(validityPeriodMonths);
  if (mandatory !== undefined) requirement.mandatory = Boolean(mandatory);
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

  await requirementRepo.save(requirement);

  await logAudit({
    who: req.user?.email ?? "system",
    what: "training-requirement-updated",
    why: `Updated ${requirement.name}`,
  });

  res.json({ requirement });
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
