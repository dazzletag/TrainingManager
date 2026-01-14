import { AppDataSource } from "./data-source";
import { Role } from "../entities/Role";
import { Person } from "../entities/Person";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Assignment } from "../entities/Assignment";
import { Evidence } from "../entities/Evidence";
import { AuditLog } from "../entities/AuditLog";

async function seed(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  try {
    const roleRepo = dataSource.getRepository(Role);
    const [careRole, nurseRole, adminRole] = await roleRepo.save([
      roleRepo.create({
        externalId: "planday-role-care",
        name: "Care Assistant",
        category: "Care",
        description: "Frontline care profile",
      }),
      roleRepo.create({
        externalId: "planday-role-nurse",
        name: "Registered Nurse",
        category: "Nurse",
        description: "Registered nurse with clinical oversight",
      }),
      roleRepo.create({
        externalId: "planday-role-admin",
        name: "Home Admin",
        category: "Admin",
        description: "Operational support staff",
      }),
    ]);

    const requirementRepo = dataSource.getRepository(TrainingRequirement);
    const [firstAid, safeguarding, diversity] = await requirementRepo.save([
      requirementRepo.create({
        name: "First Aid",
        description: "Basic emergency first aid training",
        validityPeriodMonths: 24,
        mandatory: true,
        roles: [careRole, nurseRole],
      }),
      requirementRepo.create({
        name: "Safeguarding Adults",
        description: "Adults safeguarding with scenario work",
        validityPeriodMonths: 12,
        mandatory: true,
        roles: [careRole, nurseRole],
      }),
      requirementRepo.create({
        name: "Equality & Diversity",
        description: "Values-based equality and inclusion training",
        validityPeriodMonths: 12,
        mandatory: true,
        roles: [adminRole, nurseRole, careRole],
      }),
    ]);

    const personRepo = dataSource.getRepository(Person);
    const alice = await personRepo.save(
      personRepo.create({
        externalId: "planday-employee-001",
        fullName: "Alice Thompson",
        email: "alice@company.com",
        employmentStatus: "Active",
        homeLocation: "North Care Home",
        role: careRole,
      }),
    );

    const bob = await personRepo.save(
      personRepo.create({
        externalId: "planday-employee-002",
        fullName: "Bob Singh",
        email: "bob@company.com",
        employmentStatus: "Active",
        homeLocation: "North Care Home",
        role: nurseRole,
      }),
    );

    const assignmentRepo = dataSource.getRepository(Assignment);
    const aliceAssignment = await assignmentRepo.save(
      assignmentRepo.create({
        person: alice,
        requirement: firstAid,
      }),
    );

    const evidenceRepo = dataSource.getRepository(Evidence);
    await evidenceRepo.save(
      evidenceRepo.create({
        assignment: aliceAssignment,
        type: "certificate",
        source: "Internal Training Team",
        validFrom: new Date(),
        validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        uploadedFileKey: "evidence/alice-first-aid.pdf",
        verifiedBy: "line-manager",
        confidenceLevel: 90,
      }),
    );

    await dataSource.getRepository(AuditLog).save(
      dataSource.getRepository(AuditLog).create({
        who: "system",
        what: "seed-data",
        when: new Date(),
        why: "Initial demo dataset",
      }),
    );

    console.log("Seed data inserted");
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error("Seeding failed", error);
  process.exit(1);
});
