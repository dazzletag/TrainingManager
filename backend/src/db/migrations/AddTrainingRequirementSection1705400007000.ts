import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTrainingRequirementSection1705400007000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "section",
        type: "varchar",
        isNullable: true,
        default: "'Other'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("training_requirement", "section");
  }
}
