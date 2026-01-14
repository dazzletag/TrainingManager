import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Role } from "../entities/Role";
import { Evidence } from "../entities/Evidence";
import { AuditLog } from "../entities/AuditLog";
import { logAudit } from "../services/auditLogger";
import { In } from "typeorm";

const router = Router();

router.get("/roles", async (req, res) => {
  const roles = await AppDataSource.getRepository(Role).find();
  res.json({ roles });
});

router.get("/training-requirements", async (req, res) => {
  const repo = AppDataSource.getRepository(TrainingRequirement);
  const requirements = await repo.find({ relations: ["roles"] });
  res.json({ requirements });
});

router.post("/training-requirements", async (req, res) => {
  const { name, description, validityPeriodMonths, mandatory, roleExternalIds } = req.body;

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

router.get("/audit", async (req, res) => {
  const logs = await AppDataSource.getRepository(AuditLog).find({ order: { createdAt: "DESC" } });
  res.json({ logs });
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
