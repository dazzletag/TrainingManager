import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class TrainingRequirementGroup1684090800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "training_requirement_group",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "requirementId", type: "uniqueidentifier" },
          { name: "roleId", type: "uniqueidentifier" },
          { name: "requiredLevel", type: "int" },
          { name: "mandatory", type: "bit" },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
        uniques: [{ columnNames: ["requirementId", "roleId"] }],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "person_group",
        columns: [
          { name: "personId", type: "uniqueidentifier" },
          { name: "roleId", type: "uniqueidentifier" },
        ],
        uniques: [{ columnNames: ["personId", "roleId"] }],
      }),
    );

    await queryRunner.createForeignKey(
      "training_requirement_group",
      new TableForeignKey({
        columnNames: ["requirementId"],
        referencedColumnNames: ["id"],
        referencedTableName: "training_requirement",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "training_requirement_group",
      new TableForeignKey({
        columnNames: ["roleId"],
        referencedColumnNames: ["id"],
        referencedTableName: "role",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "person_group",
      new TableForeignKey({
        columnNames: ["personId"],
        referencedColumnNames: ["id"],
        referencedTableName: "person",
        onDelete: "NO ACTION",
      }),
    );

    await queryRunner.createForeignKey(
      "person_group",
      new TableForeignKey({
        columnNames: ["roleId"],
        referencedColumnNames: ["id"],
        referencedTableName: "role",
        onDelete: "NO ACTION",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("person_group");
    await queryRunner.dropTable("training_requirement_group");
  }
}
