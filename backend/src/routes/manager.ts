import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { Person } from "../entities/Person";
import { evaluateRequirement } from "../services/complianceService";

const router = Router();

router.get("/compliance", async (req, res) => {
  const personRepo = AppDataSource.getRepository(Person);
  const people = await personRepo.find({
    relations: {
      role: {
        trainingRequirements: true,
      },
      assignments: {
        evidence: true,
      },
    },
  });

  const summaries: Record<string, any> = {};

  for (const person of people) {
    const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
    const requirementResults = (person.assignments ?? []).map((assignment) =>
      evaluateRequirement(assignment.requirement, assignmentMap.get(assignment.requirement.id)),
    );
    const requirementResultsFinal = Array.from(
      new Map(requirementResults.map((item) => [item.requirement.id, item])).values(),
    );

    const compliantCount = requirementResultsFinal.filter((item) => item.status === "compliant").length;
    const atRiskCount = requirementResultsFinal.filter((item) => item.status === "at-risk").length;
    const missingCount = requirementResultsFinal.filter((item) => item.status === "missing").length;
    const complianceRate = requirementResultsFinal.length
      ? (compliantCount / requirementResultsFinal.length) * 100
      : 0;

    const bucketKey = `${person.homeLocation}|${person.role.name}`;
    if (!summaries[bucketKey]) {
      summaries[bucketKey] = {
        homeLocation: person.homeLocation,
        role: person.role.name,
        totalPeople: 0,
        totalRequirements: 0,
        totalComplianceRate: 0,
        atRiskPeople: 0,
        missingPeople: 0,
      };
    }

    const bucket = summaries[bucketKey];
    bucket.totalPeople += 1;
    bucket.totalRequirements += requirementResultsFinal.length;
    bucket.totalComplianceRate += complianceRate;
    if (atRiskCount) bucket.atRiskPeople += 1;
    if (missingCount) bucket.missingPeople += 1;
  }

  const buckets = Object.values(summaries).map((bucket) => ({
    ...bucket,
    complianceRate: bucket.totalPeople
      ? Math.round(bucket.totalComplianceRate / bucket.totalPeople)
      : 0,
  }));

  res.json({ buckets });
});

router.get("/at-risk", async (req, res) => {
  const personRepo = AppDataSource.getRepository(Person);
  const people = await personRepo.find({
    relations: {
      role: {
        trainingRequirements: true,
      },
      assignments: {
        evidence: true,
      },
    },
  });

  const atRisk: any[] = [];

  for (const person of people) {
    const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
    const requirementResults = (person.assignments ?? []).map((assignment) =>
      evaluateRequirement(assignment.requirement, assignmentMap.get(assignment.requirement.id)),
    );
    const requirementResultsFinal = Array.from(
      new Map(requirementResults.map((item) => [item.requirement.id, item])).values(),
    );

    const needsAttention = requirementResultsFinal.some((result) => result.status !== "compliant");

    if (needsAttention) {
      atRisk.push({
        person: {
          id: person.id,
          name: person.fullName,
          role: person.role.name,
          homeLocation: person.homeLocation,
        },
        requirements: requirementResultsFinal,
      });
    }
  }

  res.json({ atRisk });
});

router.get("/evidence/:personId", async (req, res) => {
  const personId = req.params.personId;
  const personRepo = AppDataSource.getRepository(Person);

  const person = await personRepo.findOne({
    where: { id: personId },
    relations: {
      assignments: {
        evidence: true,
      },
    },
  });

  if (!person) {
    return res.status(404).json({ message: "Person not found" });
  }

  const evidence = person.assignments.flatMap((assignment) => assignment.evidence);

  res.json({
    person: {
      id: person.id,
      name: person.fullName,
      role: person.role.name,
    },
    evidence,
  });
});

export default router;
