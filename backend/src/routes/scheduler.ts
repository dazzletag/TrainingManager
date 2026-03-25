import { Router } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { AppDataSource } from "../db/data-source";
import { TrainingSession } from "../entities/TrainingSession";
import { TrainingUnavailability } from "../entities/TrainingUnavailability";
import { Person } from "../entities/Person";
import { SessionAssignment } from "../entities/SessionAssignment";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { TrainingRequirementGroup } from "../entities/TrainingRequirementGroup";
import { Assignment } from "../entities/Assignment";
import { Evidence } from "../entities/Evidence";
import { evaluateRequirement } from "../services/complianceService";
import { assignToTrainingShift, fetchMandatoryTrainingShifts } from "../services/plandayScheduling";
import { In } from "typeorm";

const router = Router();

const excludedRoleNames = new Set(["ceo", "finance director"]);

function isExcludedPerson(person: Person) {
  const name = person.fullName?.toLowerCase() ?? "";
  const status = person.employmentStatus?.toLowerCase() ?? "";
  const roleName = person.role?.name?.toLowerCase() ?? "";
  const flagged = person as Person & { hasResigned?: boolean; parentalLeave?: boolean };
  return (
    name.includes("agency") ||
    excludedRoleNames.has(roleName) ||
    flagged.hasResigned === true ||
    flagged.parentalLeave === true ||
    status.includes("resign") ||
    status.includes("parental")
  );
}


function resolvePrimaryDepartmentId(home?: string): string | undefined {
  switch ((home ?? "").trim()) {
    case "Quarry House":
      return "7653";
    case "Beech House":
      return "7655";
    case "Field House":
      return "7652";
    case "Glebe House":
      return "7654";
    default:
      return undefined;
  }
}

type RecommendInput = {
  employee_number: string;
  home: string;
  role_type: string;
  last_completed_date?: string;
};

function sortAssignmentsByHome(assignments: Array<{ person: { home?: string; name: string } }>) {
  return assignments.slice().sort((a, b) => {
    const homeA = a.person.home ?? "";
    const homeB = b.person.home ?? "";
    const homeDelta = homeA.localeCompare(homeB);
    if (homeDelta !== 0) return homeDelta;
    return a.person.name.localeCompare(b.person.name);
  });
}

async function runRecommendationScript(employees: RecommendInput[]): Promise<RecommendInput[]> {
  const scriptPath = path.join(process.cwd(), "src", "services", "SuggestAttendees.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Recommendation script not found at ${scriptPath}`);
  }

  const pythonBin = process.env.PYTHON_BIN ?? "python";
  const payload = JSON.stringify({ employees });

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Recommendation script exited with ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed.recommended ?? []);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function fallbackRecommend(employees: RecommendInput[]): RecommendInput[] {
  return employees
    .slice()
    .sort((a, b) => {
      const aDate = a.last_completed_date ? Date.parse(a.last_completed_date) : 0;
      const bDate = b.last_completed_date ? Date.parse(b.last_completed_date) : 0;
      return aDate - bDate;
    });
}

function resolveRequirementMeta(
  requirement: TrainingRequirement,
  groupMeta?: { requiredLevel: number },
): TrainingRequirement {
  if (!groupMeta) {
    return requirement;
  }
  return Object.assign({}, requirement, {
    requiredLevel: groupMeta.requiredLevel,
  });
}

function mergeRequirementMetaForPerson(
  groupIds: string[],
  metaByRoleId: Map<string, { requiredLevel: number }>,
) {
  let merged: { requiredLevel: number } | undefined;
  for (const groupId of groupIds) {
    const meta = metaByRoleId.get(groupId);
    if (!meta) continue;
    if (!merged) {
      merged = { ...meta };
      continue;
    }
    merged = {
      requiredLevel: Math.min(merged.requiredLevel, meta.requiredLevel),
    };
  }
  return merged;
}

function summarizeCompliance(
  person: Person,
  requirement: TrainingRequirement,
  assignment: Assignment | undefined,
  metaByRoleId: Map<string, { requiredLevel: number }>,
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

async function buildSchedulerOverviewData(requirementId?: string): Promise<{ overview: any[]; unassigned: any[]; unavailable: any[] }> {
  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  const personRepo = AppDataSource.getRepository(Person);
  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const requirementGroupRepo = AppDataSource.getRepository(TrainingRequirementGroup);
  const assignmentRepo = AppDataSource.getRepository(Assignment);
  const unavailabilityRepo = AppDataSource.getRepository(TrainingUnavailability);

  const mandatoryRequirement = requirementId
    ? await requirementRepo.findOne({ where: { id: requirementId } })
    : await requirementRepo.findOne({ where: { name: "Mandatory Training" } });
  if (!mandatoryRequirement) {
    return { overview: [], unassigned: [], unavailable: [] };
  }

  const sessions = await sessionRepo.find({
    where: { type: mandatoryRequirement.name },
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
    order: { day1: "ASC" },
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
  const filteredPersonList = personList.filter((person) => !isExcludedPerson(person));
  const unavailabilityEntries = await unavailabilityRepo.find({
    relations: {
      person: {
        role: true,
        groups: true,
      },
    },
  });
  const unavailableIds = new Set(
    unavailabilityEntries
      .map((entry) => entry.person)
      .filter((person) => person && !isExcludedPerson(person))
      .map((person) => person.id),
  );
  const personMap = new Map(filteredPersonList.map((person) => [person.id, person]));
  const assignmentMap = new Map(mandatoryAssignments.map((assignment) => [assignment.person.id, assignment]));

  const groupIds = Array.from(
    new Set(filteredPersonList.flatMap((person) => person.groups?.map((group) => group.id) ?? [])),
  );
  const groupLinks = groupIds.length
    ? await requirementGroupRepo.find({
        where: { requirementId: mandatoryRequirement.id, roleId: In(groupIds) },
      })
    : [];
  const metaByRoleId = new Map(
    groupLinks.map((link) => [link.roleId, { requiredLevel: link.requiredLevel }]),
  );

  const assignedPersonIds = new Set(
    sessions.flatMap((session) =>
      session.assignments
        .map((assignment) => assignment.person)
        .filter((person) => person && !isExcludedPerson(person))
        .map((person) => person.id),
    ),
  );

  const overview = sessions.map((session) => {
    const day1Assignments = session.assignments
      .filter((assignment) => assignment.day === 1)
      .map((assignment) => {
        const person = personMap.get(assignment.person.id) ?? assignment.person;
        if (!person || isExcludedPerson(person) || unavailableIds.has(person.id)) {
          return null;
        }
        const trainingDates = getTrainingDates(assignmentMap.get(person.id)?.evidence ?? []);
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
            primaryDepartmentId: resolvePrimaryDepartmentId(person.homeLocation),
            status: summarizeCompliance(
              person,
              mandatoryRequirement,
              assignmentMap.get(person.id),
              metaByRoleId,
            ).status,
            nextDue: trainingDates.nextDue?.toISOString(),
            lastTrainingAt: trainingDates.lastTrainingAt?.toISOString(),
          },
        };
      });

    const day2Assignments = session.assignments
      .filter((assignment) => assignment.day === 2)
      .map((assignment) => {
        const person = personMap.get(assignment.person.id) ?? assignment.person;
        if (!person || isExcludedPerson(person) || unavailableIds.has(person.id)) {
          return null;
        }
        const trainingDates = getTrainingDates(assignmentMap.get(person.id)?.evidence ?? []);
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
            primaryDepartmentId: resolvePrimaryDepartmentId(person.homeLocation),
            status: summarizeCompliance(
              person,
              mandatoryRequirement,
              assignmentMap.get(person.id),
              metaByRoleId,
            ).status,
            nextDue: trainingDates.nextDue?.toISOString(),
            lastTrainingAt: trainingDates.lastTrainingAt?.toISOString(),
          },
        };
      });

    return {
      id: session.id,
      name: session.name,
      type: session.type,
      day1: toIsoString(session.day1),
      day2: toIsoString(session.day2),
      day1StartTime: session.day1StartTime,
      day1EndTime: session.day1EndTime,
      day2StartTime: session.day2StartTime,
      day2EndTime: session.day2EndTime,
      day1Assignments: sortAssignmentsByHome(
        day1Assignments.filter((assignment): assignment is NonNullable<typeof assignment> => assignment !== null),
      ),
      day2Assignments: sortAssignmentsByHome(
        day2Assignments.filter((assignment): assignment is NonNullable<typeof assignment> => assignment !== null),
      ),
    };
  });

  const unassigned = filteredPersonList
    .filter((person) => !assignedPersonIds.has(person.id) && !unavailableIds.has(person.id))
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
        primaryDepartmentId: resolvePrimaryDepartmentId(person.homeLocation),
        role: person.role.name,
        roleCategory: person.role.category,
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

  const unavailable = unavailabilityEntries
    .map((entry) => entry.person)
    .filter((person): person is Person => Boolean(person) && !isExcludedPerson(person))
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
        primaryDepartmentId: resolvePrimaryDepartmentId(person.homeLocation),
        role: person.role.name,
        employmentStatus: person.employmentStatus,
        nextDue: trainingDates.nextDue?.toISOString(),
        lastTrainingAt: trainingDates.lastTrainingAt?.toISOString(),
      };
    });

  return { overview, unassigned: normalizedUnassigned, unavailable };
}

router.get("/overview", async (req, res) => {
  const requirementId = typeof req.query.requirementId === "string" ? req.query.requirementId : undefined;
  const data = await buildSchedulerOverviewData(requirementId);
  res.json(data);
});

router.post("/sessions", async (req, res) => {
  const { name, day1, day2, type, day1StartTime, day1EndTime, day2StartTime, day2EndTime } = req.body;

  if (!name || !day1 || !day2 || !day1StartTime || !day1EndTime || !day2StartTime || !day2EndTime) {
    return res.status(400).json({
      message: "Name, Day1, Day2, day1StartTime, day1EndTime, day2StartTime and day2EndTime are required",
    });
  }

  const repo = AppDataSource.getRepository(TrainingSession);
  const session = repo.create({
    name,
    day1: new Date(day1),
    day2: new Date(day2),
    day1StartTime,
    day1EndTime,
    day2StartTime,
    day2EndTime,
    type: type ?? "Mandatory Training",
  });

  await repo.save(session);

  res.status(201).json({ session });
});

router.post("/sessions/import-planday", async (req, res) => {
  try {
    const shifts = await fetchMandatoryTrainingShifts();

    if (!shifts.length) {
      return res.json({ imported: [], totalShiftsFound: 0, message: "No future mandatory training shifts found in Planday" });
    }

    const shiftsByDate = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      const existing = shiftsByDate.get(shift.date) ?? [];
      existing.push(shift);
      shiftsByDate.set(shift.date, existing);
    }

    const sortedDates = Array.from(shiftsByDate.keys()).sort();
    const datePairs: Array<{ day1: string; day2: string; shifts: typeof shifts }> = [];

    let i = 0;
    while (i < sortedDates.length) {
      const day1 = sortedDates[i];
      const day1Shifts = shiftsByDate.get(day1) ?? [];

      if (i + 1 < sortedDates.length) {
        const day2 = sortedDates[i + 1];
        const day2Shifts = shiftsByDate.get(day2) ?? [];
        const daysBetween =
          (new Date(day2).getTime() - new Date(day1).getTime()) / (1000 * 60 * 60 * 24);

        if (daysBetween <= 14) {
          datePairs.push({ day1, day2, shifts: [...day1Shifts, ...day2Shifts] });
          i += 2;
          continue;
        }
      }

      datePairs.push({ day1, day2: day1, shifts: day1Shifts });
      i += 1;
    }

    const sessionRepo = AppDataSource.getRepository(TrainingSession);
    const assignmentRepo = AppDataSource.getRepository(SessionAssignment);
    const personRepo = AppDataSource.getRepository(Person);

    const imported = [];

    for (const pair of datePairs) {
      const sessionName = `Mandatory Training ${pair.day1}`;
      const existingSession = await sessionRepo.findOne({ where: { name: sessionName } });

      if (existingSession) {
        imported.push({
          sessionName,
          day1: pair.day1,
          day2: pair.day2,
          skipped: true,
          reason: "Session already exists with this name",
          assignedCount: 0,
        });
        continue;
      }

      const day1Shifts = pair.shifts.filter((s) => s.date === pair.day1);
      const day2Shifts = pair.shifts.filter((s) => s.date === pair.day2);
      const sampleDay1 = day1Shifts[0] ?? pair.shifts[0];
      const sampleDay2 = day2Shifts[0] ?? pair.shifts[0];

      const session = await sessionRepo.save(
        sessionRepo.create({
          name: sessionName,
          day1: new Date(pair.day1),
          day2: new Date(pair.day2),
          day1StartTime: sampleDay1.startTime,
          day1EndTime: sampleDay1.endTime,
          day2StartTime: sampleDay2.startTime,
          day2EndTime: sampleDay2.endTime,
          type: "Mandatory Training",
        }),
      );

      const employeeIds = Array.from(new Set(pair.shifts.map((s) => s.employeeId)));
      const persons = employeeIds.length
        ? await personRepo.find({ where: { externalId: In(employeeIds) } })
        : [];
      const personByExternalId = new Map(persons.map((p) => [p.externalId, p]));

      const assignmentsToSave: SessionAssignment[] = [];
      let assignIndex = 0;

      for (const employeeId of employeeIds) {
        const person = personByExternalId.get(employeeId);
        if (!person) continue;
        assignIndex += 1;

        for (const day of [1, 2]) {
          const dropZoneId = `import-planday-${session.id}-${person.id}-${Date.now()}-${assignIndex}-day-${day}`;
          assignmentsToSave.push(
            assignmentRepo.create({ session, person, day, dropZoneId }),
          );
        }
      }

      if (assignmentsToSave.length) {
        await assignmentRepo.save(assignmentsToSave);
      }

      imported.push({
        sessionId: session.id,
        sessionName: session.name,
        day1: pair.day1,
        day2: pair.day2,
        skipped: false,
        assignedCount: new Set(assignmentsToSave.map((a) => a.person.id)).size,
      });
    }

    res.json({ imported, totalShiftsFound: shifts.length });
  } catch (error) {
    console.error("Failed to import Planday training shifts", error);
    res.status(500).json({ message: "Failed to import shifts from Planday" });
  }
});

router.post("/assign", async (req, res) => {
  const { sessionId, personId, day, dropZoneId } = req.body;
  if (!sessionId || !personId || !day || !dropZoneId) {
    return res.status(400).json({ message: "sessionId, personId, day, and dropZoneId are required" });
  }

  const assignmentRepo = AppDataSource.getRepository(SessionAssignment);
  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  const personRepo = AppDataSource.getRepository(Person);
  const unavailabilityRepo = AppDataSource.getRepository(TrainingUnavailability);

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

  await unavailabilityRepo.createQueryBuilder().delete().where("personId = :personId", { personId }).execute();

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

router.post("/sessions/:sessionId/recommend", async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  const assignmentRepo = AppDataSource.getRepository(SessionAssignment);
  const personRepo = AppDataSource.getRepository(Person);

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

  const requirementRepo = AppDataSource.getRepository(TrainingRequirement);
  const sessionRequirement = await requirementRepo.findOne({ where: { name: session.type } });
  const { unassigned } = await buildSchedulerOverviewData(sessionRequirement?.id);
  const unassignedByExternalId = new Map(unassigned.map((person) => [person.externalId, person]));

  const employees: RecommendInput[] = unassigned.map((person) => ({
    employee_number: person.externalId,
    home: person.home,
    role_type: person.roleCategory,
    last_completed_date: person.lastTrainingAt ? person.lastTrainingAt.split("T")[0] : undefined,
  }));

  let recommended: RecommendInput[];
  try {
    recommended = await runRecommendationScript(employees);
  } catch (error) {
    console.warn("Recommendation script failed, falling back to default sort", error);
    recommended = fallbackRecommend(employees);
  }

  const existingPersonIds = new Set(session.assignments.map((assignment) => assignment.person.id));
  const recommendedPeople = recommended
    .map((employee) => unassignedByExternalId.get(employee.employee_number))
    .filter((person) => person && !existingPersonIds.has(person.id))
    .slice(0, 14);
  const recommendedIds = recommendedPeople.map((person) => person.id);

  const people = recommendedIds.length
    ? await personRepo.find({ where: { id: In(recommendedIds) } })
    : [];
  const personMap = new Map(people.map((person) => [person.id, person]));

  const assignmentsToSave: SessionAssignment[] = [];
  const baseTimestamp = Date.now();
  let index = 0;

  for (const person of recommendedPeople) {
    const entity = personMap.get(person.id);
    if (!entity) continue;
    index += 1;
    for (const day of [1, 2]) {
      const dropZoneId = `recommend-${sessionId}-${person.id}-${baseTimestamp}-${index}-day-${day}`;
      assignmentsToSave.push(
        assignmentRepo.create({
          session,
          person: entity,
          day,
          dropZoneId,
        }),
      );
    }
  }

  if (assignmentsToSave.length) {
    await assignmentRepo.save(assignmentsToSave);
  }

  res.json({
    recommended: recommendedPeople.map((person) => ({
      id: person.id,
      externalId: person.externalId,
      name: person.name,
      home: person.home,
    })),
    assignmentsCreated: assignmentsToSave.length,
  });
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

router.post("/unavailable", async (req, res) => {
  const { personId, reason } = req.body;
  if (!personId) {
    return res.status(400).json({ message: "personId is required" });
  }

  const personRepo = AppDataSource.getRepository(Person);
  const unavailabilityRepo = AppDataSource.getRepository(TrainingUnavailability);
  const assignmentRepo = AppDataSource.getRepository(SessionAssignment);

  const person = await personRepo.findOneByOrFail({ id: personId });
  const existing = await unavailabilityRepo.findOne({
    where: { person: { id: personId } },
  });

  if (existing) {
    existing.reason = reason ?? existing.reason;
    await unavailabilityRepo.save(existing);
  } else {
    await unavailabilityRepo.save(
      unavailabilityRepo.create({
        person,
        reason,
      }),
    );
  }

  await assignmentRepo.createQueryBuilder().delete().where("personId = :personId", { personId }).execute();

  res.json({ success: true });
});

router.post("/unavailable/remove", async (req, res) => {
  const { personId } = req.body;
  if (!personId) {
    return res.status(400).json({ message: "personId is required" });
  }

  const unavailabilityRepo = AppDataSource.getRepository(TrainingUnavailability);
  await unavailabilityRepo.createQueryBuilder().delete().where("personId = :personId", { personId }).execute();

  res.json({ success: true });
});

router.delete("/sessions/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  const sessionRepo = AppDataSource.getRepository(TrainingSession);
  await sessionRepo.delete({ id: sessionId });
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

    const publishResults = [];
    for (const assignment of session.assignments) {
      publishResults.push(
        await assignToTrainingShift(
          assignment.person.id,
          assignment.person.externalId,
          session.name,
          session.id,
          assignment.day,
          assignment.day === 1 ? session.day1 : session.day2,
          assignment.day === 1 ? session.day1StartTime : session.day2StartTime,
          assignment.day === 1 ? session.day1EndTime : session.day2EndTime,
          assignment.person.homeLocation,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

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
