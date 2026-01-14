import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class InitialSchema1682347206000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "role",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "externalId", type: "varchar", isUnique: true },
          { name: "name", type: "varchar" },
          { name: "category", type: "varchar" },
          { name: "description", type: "text", isNullable: true },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "person",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "externalId", type: "varchar", isUnique: true },
          { name: "fullName", type: "varchar" },
          { name: "email", type: "varchar", isUnique: true },
          { name: "employmentStatus", type: "varchar" },
          { name: "homeLocation", type: "varchar" },
          { name: "isActive", type: "bit", default: 1 },
          { name: "roleId", type: "uniqueidentifier" },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "training_requirement",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "name", type: "varchar", isUnique: true },
          { name: "description", type: "text" },
          { name: "validityPeriodMonths", type: "int" },
          { name: "mandatory", type: "bit", default: 1 },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "assignment",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "personId", type: "uniqueidentifier" },
          { name: "requirementId", type: "uniqueidentifier" },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "evidence",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "assignmentId", type: "uniqueidentifier" },
          { name: "type", type: "varchar" },
          { name: "source", type: "varchar" },
          { name: "validFrom", type: "datetime2" },
          { name: "validTo", type: "datetime2" },
          { name: "uploadedFileKey", type: "varchar" },
          { name: "verifiedBy", type: "varchar" },
          { name: "confidenceLevel", type: "int", default: 0 },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "audit_log",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "who", type: "varchar" },
          { name: "what", type: "varchar" },
          { name: "when", type: "datetime2" },
          { name: "why", type: "text" },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "training_requirement_roles_role",
        columns: [
          { name: "trainingRequirementId", type: "uniqueidentifier" },
          { name: "roleId", type: "uniqueidentifier" },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      "person",
      new TableForeignKey({
        columnNames: ["roleId"],
        referencedColumnNames: ["id"],
        referencedTableName: "role",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "assignment",
      new TableForeignKey({
        columnNames: ["personId"],
        referencedColumnNames: ["id"],
        referencedTableName: "person",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "assignment",
      new TableForeignKey({
        columnNames: ["requirementId"],
        referencedColumnNames: ["id"],
        referencedTableName: "training_requirement",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "evidence",
      new TableForeignKey({
        columnNames: ["assignmentId"],
        referencedColumnNames: ["id"],
        referencedTableName: "assignment",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "training_requirement_roles_role",
      new TableForeignKey({
        columnNames: ["trainingRequirementId"],
        referencedColumnNames: ["id"],
        referencedTableName: "training_requirement",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "training_requirement_roles_role",
      new TableForeignKey({
        columnNames: ["roleId"],
        referencedColumnNames: ["id"],
        referencedTableName: "role",
        onDelete: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("training_requirement_roles_role");
    await queryRunner.dropTable("audit_log");
    await queryRunner.dropTable("evidence");
    await queryRunner.dropTable("assignment");
    await queryRunner.dropTable("training_requirement");
    await queryRunner.dropTable("person");
    await queryRunner.dropTable("role");
  }
}
