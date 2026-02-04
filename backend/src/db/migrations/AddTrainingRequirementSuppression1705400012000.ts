import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddTrainingRequirementSuppression1705400012000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "training_requirement_suppression",
        columns: [
          {
            name: "id",
            type: "uniqueidentifier",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "uuid",
          },
          {
            name: "fieldIdentifier",
            type: "nvarchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "name",
            type: "nvarchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "createdAt",
            type: "datetime2",
            default: "GETUTCDATE()",
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("training_requirement_suppression");
  }
}
