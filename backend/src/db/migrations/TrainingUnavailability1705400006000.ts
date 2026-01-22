import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

/* eslint-disable sort-keys-fix/sort-keys-fix */
export class TrainingUnavailability1705400006000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "training_unavailability",
        columns: [
          { name: "id", type: "uniqueidentifier", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "personId", type: "uniqueidentifier", isUnique: true },
          { name: "reason", type: "varchar", isNullable: true },
          { name: "createdAt", type: "datetime2", default: "GETUTCDATE()" },
          { name: "updatedAt", type: "datetime2", default: "GETUTCDATE()" },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      "training_unavailability",
      new TableForeignKey({
        columnNames: ["personId"],
        referencedColumnNames: ["id"],
        referencedTableName: "person",
        onDelete: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("training_unavailability");
  }
}
