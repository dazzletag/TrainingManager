import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { TrainingSession } from "../entities/TrainingSession";
import { Person } from "../entities/Person";
import { SessionAssignment } from "../entities/SessionAssignment";
import { evaluateRequirement } from "../services/complianceService";
import { assignToTrainingShift } from "../services/plandayScheduling";

const router = Router();

function listRequirements(person: Person) {
  const requirementSet = new Map<string, any>();
  for (const assignment of person.assignments ?? []) {
    requirementSet.set(assignment.requirement.id, assignment.requirement);
  }
  for (const requirement of person.role?.trainingRequirements ?? []) {
    requirementSet.set(requirement.id, requirement);
  }
  return Array.from(requirementSet.values());
}

function summarizeCompliance(person: Person) {
  const requirementMap = new Map(person.assignments?.map((assignment) => [assignment.requirement.id, assignment]));
  const requirements = listRequirements(person).map((requirement) =>
    evaluateRequirement(requirement, requirementMap.get(requirement.id)),
  );
  const hasIssue = requirements.some((requirement) => requirement.status !== "compliant");
  return {
    status: hasIssue ? (requirements.some((result) => result.status === "missing") ? "missing" : "at-risk") : "compliant",
    requirements,
  };
}

function getTrainingDates(person: Person) {
  const evidenceEntries = person.assignments?.flatMap((assignment) => assignment.evidence ?? []) ?? [];
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

router.get("/overview", async (_req, res) => {
  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  const personRepo = AppDataSource.getRepository(Person);

  const sessions = await sessionRepo.find({
    relations: {
      assignments: {
        person: {
          role: {
            trainingRequirements: true,
          },
          assignments: {
            evidence: true,
          },
        },
      },
    },
  });

  const personList = await personRepo.find({
    relations: {
      role: {
        trainingRequirements: true,
      },
      assignments: {
        evidence: true,
      },
    },
  });

  const assignedPersonIds = new Set(
    sessions.flatMap((session) => session.assignments.map((assignment) => assignment.person.id)),
  );

  const overview = sessions.map((session) => {
    const day1Assignments = session.assignments
      .filter((assignment) => assignment.day === 1)
      .map((assignment) => ({
        id: assignment.id,
        dropZoneId: assignment.dropZoneId,
        person: {
          id: assignment.person.id,
          externalId: assignment.person.externalId,
          name: assignment.person.fullName,
          email: assignment.person.email,
          role: assignment.person.role.name,
          home: assignment.person.homeLocation,
          status: summarizeCompliance(assignment.person).status,
        },
      }));

    const day2Assignments = session.assignments
      .filter((assignment) => assignment.day === 2)
      .map((assignment) => ({
        id: assignment.id,
        dropZoneId: assignment.dropZoneId,
        person: {
          id: assignment.person.id,
          externalId: assignment.person.externalId,
          name: assignment.person.fullName,
          email: assignment.person.email,
          role: assignment.person.role.name,
          home: assignment.person.homeLocation,
          status: summarizeCompliance(assignment.person).status,
        },
      }));

    return {
      id: session.id,
      name: session.name,
      type: session.type,
      day1: session.day1.toISOString(),
      day2: session.day2.toISOString(),
      day1Assignments,
      day2Assignments,
    };
  });

  const unassigned = personList
    .filter((person) => !assignedPersonIds.has(person.id))
    .map((person) => {
      const compliance = summarizeCompliance(person);
      const trainingDates = getTrainingDates(person);
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
    });

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
  const { name, day1, day2, type } = req.body;

  if (!name || !day1 || !day2) {
    return res.status(400).json({ message: "Name, Day1 and Day2 are required" });
  }

  const repo = AppDataSource.getRepository(TrainingSession);
  const session = repo.create({
    name,
    day1: new Date(day1),
    day2: new Date(day2),
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
      role: {
        trainingRequirements: true,
      },
      assignments: {
        evidence: true,
      },
    },
  });

  let assignment = await assignmentRepo.findOne({
    where: {
      session: { id: sessionId },
      person: { id: personId },
      day,
    },
  });

  if (!assignment) {
    assignment = assignmentRepo.create({
      session,
      person,
      day,
      dropZoneId,
    });
  } else {
    assignment.dropZoneId = dropZoneId;
  }

  await assignmentRepo.save(assignment);

  res.json({ assignment });
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
