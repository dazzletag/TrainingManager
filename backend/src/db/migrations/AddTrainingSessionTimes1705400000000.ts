import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTrainingSessionTimes1705400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("training_session", [
      new TableColumn({
        name: "startTime",
        type: "varchar",
        length: "5",
        isNullable: false,
        default: "'09:15'",
      }),
      new TableColumn({
        name: "endTime",
        type: "varchar",
        length: "5",
        isNullable: false,
        default: "'15:45'",
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("training_session", "endTime");
    await queryRunner.dropColumn("training_session", "startTime");
  }
}
