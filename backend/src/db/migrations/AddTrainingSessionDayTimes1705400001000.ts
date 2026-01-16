import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTrainingSessionDayTimes1705400001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("training_session", [
      new TableColumn({
        name: "day1StartTime",
        type: "varchar",
        length: "5",
        isNullable: false,
        default: "'09:15'",
      }),
      new TableColumn({
        name: "day1EndTime",
        type: "varchar",
        length: "5",
        isNullable: false,
        default: "'15:45'",
      }),
      new TableColumn({
        name: "day2StartTime",
        type: "varchar",
        length: "5",
        isNullable: false,
        default: "'09:15'",
      }),
      new TableColumn({
        name: "day2EndTime",
        type: "varchar",
        length: "5",
        isNullable: false,
        default: "'15:45'",
      }),
    ]);

    await queryRunner.query(
      "UPDATE training_session SET day1StartTime = startTime, day1EndTime = endTime, day2StartTime = startTime, day2EndTime = endTime WHERE startTime IS NOT NULL AND endTime IS NOT NULL",
    );

    await queryRunner.dropColumn("training_session", "startTime");
    await queryRunner.dropColumn("training_session", "endTime");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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

    await queryRunner.query(
      "UPDATE training_session SET startTime = day1StartTime, endTime = day1EndTime WHERE day1StartTime IS NOT NULL AND day1EndTime IS NOT NULL",
    );

    await queryRunner.dropColumn("training_session", "day2EndTime");
    await queryRunner.dropColumn("training_session", "day2StartTime");
    await queryRunner.dropColumn("training_session", "day1EndTime");
    await queryRunner.dropColumn("training_session", "day1StartTime");
  }
}
