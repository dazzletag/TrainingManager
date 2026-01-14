import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

/* eslint-disable sort-keys-fix/sort-keys-fix */
export class TrainingSessions1684090400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "training_session",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "name", type: "varchar" },
          { name: "day1", type: "date" },
          { name: "day2", type: "date" },
          { name: "type", type: "varchar", default: "'Mandatory Training'" },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "session_assignment",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "sessionId", type: "uuid" },
          { name: "personId", type: "uuid" },
          { name: "day", type: "int" },
          { name: "dropZoneId", type: "varchar" },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      "session_assignment",
      new TableForeignKey({
        columnNames: ["sessionId"],
        referencedColumnNames: ["id"],
        referencedTableName: "training_session",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "session_assignment",
      new TableForeignKey({
        columnNames: ["personId"],
        referencedColumnNames: ["id"],
        referencedTableName: "person",
        onDelete: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("session_assignment");
    await queryRunner.dropTable("training_session");
  }
}
