import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class TrainingRequirementMetadata1684090500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "requiredLevel",
        type: "int",
        default: 1,
      }),
    );

    await queryRunner.addColumn(
      "training_requirement",
      new TableColumn({
        name: "category",
        type: "varchar",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("training_requirement", "category");
    await queryRunner.dropColumn("training_requirement", "requiredLevel");
  }
}
