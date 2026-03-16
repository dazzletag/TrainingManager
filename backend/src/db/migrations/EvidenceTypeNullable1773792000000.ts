import { MigrationInterface, QueryRunner } from "typeorm";

export class EvidenceTypeNullable1773792000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "evidence" ALTER COLUMN "type" nvarchar(255) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "evidence" SET "type" = '' WHERE "type" IS NULL`);
    await queryRunner.query(`ALTER TABLE "evidence" ALTER COLUMN "type" nvarchar(255) NOT NULL`);
  }
}
