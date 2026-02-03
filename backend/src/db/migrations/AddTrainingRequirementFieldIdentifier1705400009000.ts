import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTrainingRequirementFieldIdentifier1705400009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "fieldIdentifier",
        type: "varchar",
        isNullable: true,
      }),
    );
    await queryRunner.query(
      "UPDATE training_requirement SET fieldIdentifier = name WHERE fieldIdentifier IS NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("training_requirement", "fieldIdentifier");
  }
}
