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
    const requirementSet = new Map<string, any>();
    for (const assignment of person.assignments ?? []) {
      requirementSet.set(assignment.requirement.id, assignment.requirement);
    }
    for (const requirement of person.role?.trainingRequirements ?? []) {
      requirementSet.set(requirement.id, requirement);
    }
    const requirementResults = Array.from(requirementSet.values()).map((requirement) =>
      evaluateRequirement(requirement, assignmentMap.get(requirement.id)),
    );

    const compliantCount = requirementResults.filter((item) => item.status === "compliant").length;
    const atRiskCount = requirementResults.filter((item) => item.status === "at-risk").length;
    const missingCount = requirementResults.filter((item) => item.status === "missing").length;
    const complianceRate = requirementResults.length ? (compliantCount / requirementResults.length) * 100 : 0;

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
    bucket.totalRequirements += requirementResults.length;
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
    const requirementSet = new Map<string, any>();
    for (const assignment of person.assignments ?? []) {
      requirementSet.set(assignment.requirement.id, assignment.requirement);
    }
    for (const requirement of person.role?.trainingRequirements ?? []) {
      requirementSet.set(requirement.id, requirement);
    }
    const requirementResults = Array.from(requirementSet.values()).map((requirement) =>
      evaluateRequirement(requirement, assignmentMap.get(requirement.id)),
    );

    const needsAttention = requirementResults.some((result) => result.status !== "compliant");

    if (needsAttention) {
      atRisk.push({
        person: {
          id: person.id,
          name: person.fullName,
          role: person.role.name,
          homeLocation: person.homeLocation,
        },
        requirements: requirementResults,
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
