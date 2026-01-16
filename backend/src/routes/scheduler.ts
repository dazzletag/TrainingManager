import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { TrainingSession } from "../entities/TrainingSession";
import { Person } from "../entities/Person";
import { SessionAssignment } from "../entities/SessionAssignment";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { Assignment } from "../entities/Assignment";
import { Evidence } from "../entities/Evidence";
import { evaluateRequirement } from "../services/complianceService";
import { assignToTrainingShift } from "../services/plandayScheduling";
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

function mergeRequirementMetaForPerson(
  groupIds: string[],
  metaByRoleId: Map<string, { requiredLevel: number; mandatory: boolean }>,
) {
  let merged: { requiredLevel: number; mandatory: boolean } | undefined;
  for (const groupId of groupIds) {
    const meta = metaByRoleId.get(groupId);
    if (!meta) continue;
    if (!merged) {
      merged = { ...meta };
      continue;
    }
    merged = {
      requiredLevel: Math.min(merged.requiredLevel, meta.requiredLevel),
      mandatory: merged.mandatory || meta.mandatory,
    };
  }
  return merged;
}

function summarizeCompliance(
  person: Person,
  requirement: TrainingRequirement,
  assignment: Assignment | undefined,
  metaByRoleId: Map<string, { requiredLevel: number; mandatory: boolean }>,
) {
  const groupIds = person.groups?.map((group) => group.id) ?? [];
  const requirementMeta = mergeRequirementMetaForPerson(groupIds, metaByRoleId);
  const result = evaluateRequirement(
    resolveRequirementMeta(requirement, requirementMeta),
    assignment,
  );
  return {
    status: result.status,
    requirements: [result],
  };
}

function getTrainingDates(evidenceEntries: Evidence[]) {
  const expiryTimestamps = evidenceEntries
    .map((entry) => entry.validTo?.getTime())
    .filter((value): value is number => typeof value === "number");
  const lastTrainingTimestamps = evidenceEntries
    .map((entry) => entry.validFrom?.getTime())
    .filter((value): value is number => typeof value === "number");

  const nextDue =
    expiryTimestamps.length > 0 ? new Date(Math.min(...expiryTimestamps)) : undefined;
  const lastTrainingAt =
    lastTrainingTimestamps.length > 0 ? new Date(Math.max(...lastTrainingTimestamps)) : undefined;

  return { nextDue, lastTrainingAt };
}

function toIsoString(value?: Date | string | null) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

router.get("/overview", async (_req, res) => {
  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  const personRepo = AppDataSource.getRepository(Person);
  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const requirementGroupRepo = AppDataSource.getRepository(TrainingRequirementGroup);
  const assignmentRepo = AppDataSource.getRepository(Assignment);

  const mandatoryRequirement = await requirementRepo.findOne({
    where: { name: "Mandatory Training" },
  });
  if (!mandatoryRequirement) {
    return res.json({ overview: [], unassigned: [] });
  }

  const sessions = await sessionRepo.find({
    relations: {
      assignments: {
        person: {
          groups: true,
          assignments: {
            evidence: true,
          },
        },
      },
    },
  });

  const mandatoryAssignments = await assignmentRepo.find({
    where: { requirement: { id: mandatoryRequirement.id } },
    relations: { evidence: true },
  });
  const personIds = Array.from(new Set(mandatoryAssignments.map((assignment) => assignment.person.id)));
  const personList = personIds.length
    ? await personRepo.find({
        where: { id: In(personIds) },
        relations: { role: true, groups: true },
      })
    : [];
  const personMap = new Map(personList.map((person) => [person.id, person]));
  const assignmentMap = new Map(mandatoryAssignments.map((assignment) => [assignment.person.id, assignment]));

  const groupIds = Array.from(
    new Set(personList.flatMap((person) => person.groups?.map((group) => group.id) ?? [])),
  );
  const groupLinks = groupIds.length
    ? await requirementGroupRepo.find({
        where: { requirementId: mandatoryRequirement.id, roleId: In(groupIds) },
      })
    : [];
  const metaByRoleId = new Map(
    groupLinks.map((link) => [link.roleId, { requiredLevel: link.requiredLevel, mandatory: link.mandatory }]),
  );

  const assignedPersonIds = new Set(
    sessions.flatMap((session) => session.assignments.map((assignment) => assignment.person.id)),
  );

  const overview = sessions.map((session) => {
    const day1Assignments = session.assignments
      .filter((assignment) => assignment.day === 1)
      .map((assignment) => {
        const person = personMap.get(assignment.person.id) ?? assignment.person;
        return {
          id: assignment.id,
          dropZoneId: assignment.dropZoneId,
          person: {
            id: person.id,
            externalId: person.externalId,
            name: person.fullName,
            email: person.email,
            role: person.role.name,
            home: person.homeLocation,
            status: summarizeCompliance(
              person,
              mandatoryRequirement,
              assignmentMap.get(person.id),
              metaByRoleId,
            ).status,
          },
        };
      });

    const day2Assignments = session.assignments
      .filter((assignment) => assignment.day === 2)
      .map((assignment) => {
        const person = personMap.get(assignment.person.id) ?? assignment.person;
        return {
          id: assignment.id,
          dropZoneId: assignment.dropZoneId,
          person: {
            id: person.id,
            externalId: person.externalId,
            name: person.fullName,
            email: person.email,
            role: person.role.name,
            home: person.homeLocation,
            status: summarizeCompliance(
              person,
              mandatoryRequirement,
              assignmentMap.get(person.id),
              metaByRoleId,
            ).status,
          },
        };
      });

    return {
      id: session.id,
      name: session.name,
      type: session.type,
      day1: toIsoString(session.day1),
      day2: toIsoString(session.day2),
      startTime: session.startTime,
      endTime: session.endTime,
      day1Assignments,
      day2Assignments,
    };
  });

  const unassigned = personList
    .filter((person) => !assignedPersonIds.has(person.id))
    .map((person) => {
      const compliance = summarizeCompliance(
        person,
        mandatoryRequirement,
        assignmentMap.get(person.id),
        metaByRoleId,
      );
      const evidenceEntries = assignmentMap.get(person.id)?.evidence ?? [];
      const trainingDates = getTrainingDates(evidenceEntries);
      return {
        id: person.id,
        externalId: person.externalId,
        name: person.fullName,
        status: compliance.status,
        home: person.homeLocation,
        role: person.role.name,
        employmentStatus: person.employmentStatus,
        nextDue: trainingDates.nextDue,
        lastTrainingAt: trainingDates.lastTrainingAt,
      };
    })
    .filter((person) => person.status !== "compliant");

  const sortedUnassigned = unassigned.slice().sort((a, b) => {
    if (!a.nextDue && !b.nextDue) return 0;
    if (!a.nextDue) return 1;
    if (!b.nextDue) return -1;
    return a.nextDue.getTime() - b.nextDue.getTime();
  });

  const normalizedUnassigned = sortedUnassigned.map((person) => ({
    ...person,
    nextDue: person.nextDue?.toISOString(),
    lastTrainingAt: person.lastTrainingAt?.toISOString(),
  }));

  res.json({ overview, unassigned: normalizedUnassigned });
});

router.post("/sessions", async (req, res) => {
  const { name, day1, day2, type, startTime, endTime } = req.body;

  if (!name || !day1 || !day2 || !startTime || !endTime) {
    return res
      .status(400)
      .json({ message: "Name, Day1, Day2, startTime and endTime are required" });
  }

  const repo = AppDataSource.getRepository(TrainingSession);
  const session = repo.create({
    name,
    day1: new Date(day1),
    day2: new Date(day2),
    startTime,
    endTime,
    type: type ?? "Mandatory Training",
  });

  await repo.save(session);

  res.status(201).json({ session });
});

router.post("/assign", async (req, res) => {
  const { sessionId, personId, day, dropZoneId } = req.body;
  if (!sessionId || !personId || !day || !dropZoneId) {
    return res.status(400).json({ message: "sessionId, personId, day, and dropZoneId are required" });
  }

  const assignmentRepo = AppDataSource.getRepository(SessionAssignment);
  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  const personRepo = AppDataSource.getRepository(Person);

  const session = await sessionRepo.findOneByOrFail({ id: sessionId });
  const person = await personRepo.findOneOrFail({
    where: { id: personId },
    relations: {
      role: true,
      groups: true,
      assignments: {
        evidence: true,
      },
    },
  });

  const existingAssignments = await assignmentRepo.find({
    where: {
      session: { id: sessionId },
      person: { id: personId },
    },
  });
  const assignmentsByDay = new Map(existingAssignments.map((assignment) => [assignment.day, assignment]));
  const assignments: SessionAssignment[] = [];

  for (const targetDay of [1, 2]) {
    const dayDropZoneId = `${dropZoneId}-day-${targetDay}`;
    let assignment = assignmentsByDay.get(targetDay);
    if (!assignment) {
      assignment = assignmentRepo.create({
        session,
        person,
        day: targetDay,
        dropZoneId: dayDropZoneId,
      });
    } else {
      assignment.dropZoneId = dayDropZoneId;
    }
    assignments.push(assignment);
  }

  await assignmentRepo.save(assignments);

  res.json({ assignments });
});

router.post("/assign/remove", async (req, res) => {
  const { assignmentId } = req.body;
  if (!assignmentId) {
    return res.status(400).json({ message: "assignmentId is required" });
  }

  const assignmentRepo = AppDataSource.getRepository(SessionAssignment);
  await assignmentRepo.delete({ id: assignmentId });
  res.status(204).send();
});

router.post("/sessions/:sessionId/publish", async (req, res) => {
  const { sessionId } = req.params;
  const sessionRepo = AppDataSource.getRepository(TrainingSession);

  try {
    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      relations: {
        assignments: {
          person: true,
        },
      },
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const publishResults = await Promise.all(
      session.assignments.map((assignment) =>
        assignToTrainingShift(
          assignment.person.id,
          assignment.person.externalId,
          session.name,
          session.id,
          assignment.day,
          assignment.day === 1 ? session.day1 : session.day2,
          session.startTime,
          session.endTime,
        ),
      ),
    );

    res.json({
      sessionId: session.id,
      publishedAt: new Date().toISOString(),
      results: publishResults,
    });
  } catch (error) {
    console.error("Unable to publish session to Planday", error);
    res.status(500).json({ message: "Unable to publish session" });
  }
});

export default router;
