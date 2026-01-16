import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { Person } from "../entities/Person";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { Assignment } from "../entities/Assignment";
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
  const requirementName = (req.query.requirementName as string | undefined)?.trim();
  if (requirementName) {
    const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
    const assignmentRepo = AppDataSource.getRepository(Assignment);
    const requirementGroupRepo = AppDataSource.getRepository(TrainingRequirementGroup);
    const personRepo = AppDataSource.getRepository(Person);

    const requirement = await requirementRepo.findOne({ where: { name: requirementName } });
    if (!requirement) {
      return res.json({ buckets: [] });
    }

    const assignments = await assignmentRepo.find({
      where: { requirement: { id: requirement.id } },
      relations: { evidence: true, person: true },
    });
    const personIds = Array.from(new Set(assignments.map((assignment) => assignment.person.id)));
    const people = personIds.length
      ? await personRepo.find({
          where: { id: In(personIds) },
          relations: { role: true, groups: true },
        })
      : [];

    const groupIds = Array.from(
      new Set(people.flatMap((person) => person.groups?.map((group) => group.id) ?? [])),
    );
    const groupLinks = groupIds.length
      ? await requirementGroupRepo.find({
          where: { requirementId: requirement.id, roleId: In(groupIds) },
        })
      : [];
    const metaByRoleId = new Map(
      groupLinks.map((link) => [link.roleId, { requiredLevel: link.requiredLevel, mandatory: link.mandatory }]),
    );

    const assignmentMap = new Map(assignments.map((assignment) => [assignment.person.id, assignment]));
    const summaries: Record<string, any> = {};

    for (const person of people) {
      const groupIdsForPerson = person.groups?.map((group) => group.id) ?? [];
      let merged: { requiredLevel: number; mandatory: boolean } | undefined;
      for (const groupId of groupIdsForPerson) {
        const meta = metaByRoleId.get(groupId);
        if (!meta) continue;
        if (!merged) {
          merged = { ...meta };
        } else {
          merged = {
            requiredLevel: Math.min(merged.requiredLevel, meta.requiredLevel),
            mandatory: merged.mandatory || meta.mandatory,
          };
        }
      }
      const resolvedRequirement = merged
        ? Object.assign({}, requirement, {
            requiredLevel: merged.requiredLevel,
            mandatory: merged.mandatory,
          })
        : requirement;
      const result = evaluateRequirement(resolvedRequirement, assignmentMap.get(person.id));

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
      bucket.totalRequirements += 1;
      bucket.totalComplianceRate += result.status === "compliant" ? 100 : 0;
      if (result.status === "at-risk") bucket.atRiskPeople += 1;
      if (result.status === "missing") bucket.missingPeople += 1;
    }

    const buckets = Object.values(summaries).map((bucket) => ({
      ...bucket,
      complianceRate: bucket.totalPeople
        ? Math.round(bucket.totalComplianceRate / bucket.totalPeople)
        : 0,
    }));

    return res.json({ buckets });
  }

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
  const requirementName = (req.query.requirementName as string | undefined)?.trim();
  if (requirementName) {
    const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
    const assignmentRepo = AppDataSource.getRepository(Assignment);
    const requirementGroupRepo = AppDataSource.getRepository(TrainingRequirementGroup);
    const personRepo = AppDataSource.getRepository(Person);

    const requirement = await requirementRepo.findOne({ where: { name: requirementName } });
    if (!requirement) {
      return res.json({ atRisk: [] });
    }

    const assignments = await assignmentRepo.find({
      where: { requirement: { id: requirement.id } },
      relations: { evidence: true, person: true },
    });
    const personIds = Array.from(new Set(assignments.map((assignment) => assignment.person.id)));
    const people = personIds.length
      ? await personRepo.find({
          where: { id: In(personIds) },
          relations: { role: true, groups: true },
        })
      : [];

    const groupIds = Array.from(
      new Set(people.flatMap((person) => person.groups?.map((group) => group.id) ?? [])),
    );
    const groupLinks = groupIds.length
      ? await requirementGroupRepo.find({
          where: { requirementId: requirement.id, roleId: In(groupIds) },
        })
      : [];
    const metaByRoleId = new Map(
      groupLinks.map((link) => [link.roleId, { requiredLevel: link.requiredLevel, mandatory: link.mandatory }]),
    );

    const assignmentMap = new Map(assignments.map((assignment) => [assignment.person.id, assignment]));
    const atRisk: any[] = [];

    for (const person of people) {
      const groupIdsForPerson = person.groups?.map((group) => group.id) ?? [];
      let merged: { requiredLevel: number; mandatory: boolean } | undefined;
      for (const groupId of groupIdsForPerson) {
        const meta = metaByRoleId.get(groupId);
        if (!meta) continue;
        if (!merged) {
          merged = { ...meta };
        } else {
          merged = {
            requiredLevel: Math.min(merged.requiredLevel, meta.requiredLevel),
            mandatory: merged.mandatory || meta.mandatory,
          };
        }
      }
      const resolvedRequirement = merged
        ? Object.assign({}, requirement, {
            requiredLevel: merged.requiredLevel,
            mandatory: merged.mandatory,
          })
        : requirement;
      const result = evaluateRequirement(resolvedRequirement, assignmentMap.get(person.id));

      if (result.status !== "compliant") {
        atRisk.push({
          person: {
            id: person.id,
            name: person.fullName,
            role: person.role.name,
            homeLocation: person.homeLocation,
          },
          requirements: [result],
        });
      }
    }

    return res.json({ atRisk });
  }

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
