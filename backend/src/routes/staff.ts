import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { Assignment } from "../entities/Assignment";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Person } from "../entities/Person";
import { Evidence } from "../entities/Evidence";
import { evaluateRequirement } from "../services/complianceService";
import { logAudit } from "../services/auditLogger";

const router = Router();

router.get("/directory", async (req, res) => {
  const limitRaw = req.query.limit as string | undefined;
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 10;
  const limit = Math.min(Math.max(Number.isFinite(limitParsed) ? limitParsed : 10, 1), 100);

  const personRepo = AppDataSource.getRepository(Person);
  const people = await personRepo.find({
    select: {
      id: true,
      externalId: true,
      fullName: true,
      email: true,
      employmentStatus: true,
      homeLocation: true,
    },
    order: { fullName: "ASC" },
    take: limit,
  });

  res.json({ people });
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
      role: {
        trainingRequirements: true,
      },
      assignments: {
        evidence: true,
      },
    },
  });

  if (!person) {
    return res.status(404).json({ message: "Person not found" });
  }

  const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));

  const requirements = person.role.trainingRequirements.map((requirement) =>
    evaluateRequirement(requirement, assignmentMap.get(requirement.id)),
  );

  res.json({
    person: {
      id: person.id,
      name: person.fullName,
      email: person.email,
      role: person.role.name,
      homeLocation: person.homeLocation,
    },
    requirements,
  });
});

router.get("/:personId/requirements", async (req, res) => {
  const personId = req.params.personId;
  const personRepo = AppDataSource.getRepository(Person);

  const person = await personRepo.findOne({
    where: { id: personId },
    relations: {
      role: {
        trainingRequirements: true,
      },
      assignments: {
        evidence: true,
      },
    },
  });

  if (!person) {
    return res.status(404).json({ message: "Person not found" });
  }

  const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));

  const requirements = person.role.trainingRequirements.map((requirement) =>
    evaluateRequirement(requirement, assignmentMap.get(requirement.id)),
  );

  res.json({
    person: {
      id: person.id,
      name: person.fullName,
      email: person.email,
      role: person.role.name,
      homeLocation: person.homeLocation,
    },
    requirements,
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

  if (!requirementId || !type || !source || !validFrom || !validTo || !uploadedFileKey || !verifiedBy) {
    return res.status(400).json({ message: "Missing required evidence fields" });
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

export default router;
