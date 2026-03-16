import { MigrationInterface, QueryRunner } from "typeorm";

export class EvidenceUploadedFileKeyNullable1773705600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "evidence" ALTER COLUMN "uploadedFileKey" nvarchar(255) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "evidence" SET "uploadedFileKey" = '' WHERE "uploadedFileKey" IS NULL`);
    await queryRunner.query(`ALTER TABLE "evidence" ALTER COLUMN "uploadedFileKey" nvarchar(255) NOT NULL`);
  }
}
