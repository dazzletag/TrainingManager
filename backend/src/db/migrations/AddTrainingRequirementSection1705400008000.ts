import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddTrainingRequirementSection1705400008000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "training_requirement_section",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "uuid",
          },
          {
            name: "name",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "createdAt",
            type: "datetime2",
            default: "GETUTCDATE()",
          },
          {
            name: "updatedAt",
            type: "datetime2",
            default: "GETUTCDATE()",
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("training_requirement_section");
  }
}
