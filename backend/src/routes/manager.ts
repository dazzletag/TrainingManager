import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { Person } from "../entities/Person";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { evaluateRequirement } from "../services/complianceService";
import { In } from "typeorm";

const router = Router();

function resolveRequirementMeta(
  requirement: TrainingRequirement,
  groupMeta?: { requiredLevel: number; mandatory: boolean },
): TrainingRequirement {
  if (!groupMeta) {
    return requirement;
  }
  return Object.assign({}, requirement, {
    requiredLevel: groupMeta.requiredLevel,
    mandatory: groupMeta.mandatory,
  });
}

async function buildRequirementMetaByGroup(groupIds: string[]) {
  if (!groupIds.length) {
    return new Map<string, Map<string, { requiredLevel: number; mandatory: boolean }>>();
  }
  const repo = AppDataSource.getRepository(TrainingRequirementGroup);
  const links = await repo.find({
    where: { roleId: In(groupIds) },
  });
  const byGroup = new Map<string, Map<string, { requiredLevel: number; mandatory: boolean }>>();
  for (const link of links) {
    if (!byGroup.has(link.roleId)) {
      byGroup.set(link.roleId, new Map());
    }
    byGroup.get(link.roleId)!.set(link.requirementId, {
      requiredLevel: link.requiredLevel,
      mandatory: link.mandatory,
    });
  }
  return byGroup;
}

function mergeGroupRequirementMeta(
  groupIds: string[],
  byGroup: Map<string, Map<string, { requiredLevel: number; mandatory: boolean }>>,
) {
  const metaMap = new Map<string, { requiredLevel: number; mandatory: boolean }>();
  for (const groupId of groupIds) {
    const groupMap = byGroup.get(groupId);
    if (!groupMap) continue;
    for (const [requirementId, meta] of groupMap.entries()) {
      const existing = metaMap.get(requirementId);
      if (!existing) {
        metaMap.set(requirementId, { ...meta });
        continue;
      }
      metaMap.set(requirementId, {
        requiredLevel: Math.min(existing.requiredLevel, meta.requiredLevel),
        mandatory: existing.mandatory || meta.mandatory,
      });
    }
  }
  return metaMap;
}

router.get("/compliance", async (req, res) => {
  const personRepo = AppDataSource.getRepository(Person);
  const people = await personRepo.find({
    relations: {
      role: true,
      groups: true,
      assignments: {
        evidence: true,
      },
    },
  });
  const groupIds = Array.from(
    new Set(people.flatMap((person) => person.groups?.map((group) => group.id) ?? [])),
  );
  const requirementMetaByGroup = await buildRequirementMetaByGroup(groupIds);

  const summaries: Record<string, any> = {};

  for (const person of people) {
    const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
    const personGroupIds = person.groups?.map((group) => group.id) ?? [];
    const requirementMeta = mergeGroupRequirementMeta(personGroupIds, requirementMetaByGroup);
    const requirementResults = (person.assignments ?? []).map((assignment) =>
      evaluateRequirement(
        resolveRequirementMeta(assignment.requirement, requirementMeta.get(assignment.requirement.id)),
        assignmentMap.get(assignment.requirement.id),
      ),
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
      role: true,
      groups: true,
      assignments: {
        evidence: true,
      },
    },
  });
  const groupIds = Array.from(
    new Set(people.flatMap((person) => person.groups?.map((group) => group.id) ?? [])),
  );
  const requirementMetaByGroup = await buildRequirementMetaByGroup(groupIds);

  const atRisk: any[] = [];

  for (const person of people) {
    const assignmentMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
    const personGroupIds = person.groups?.map((group) => group.id) ?? [];
    const requirementMeta = mergeGroupRequirementMeta(personGroupIds, requirementMetaByGroup);
    const requirementResults = (person.assignments ?? []).map((assignment) =>
      evaluateRequirement(
        resolveRequirementMeta(assignment.requirement, requirementMeta.get(assignment.requirement.id)),
        assignmentMap.get(assignment.requirement.id),
      ),
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
