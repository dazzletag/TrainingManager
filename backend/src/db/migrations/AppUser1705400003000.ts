import { MigrationInterface, QueryRunner } from "typeorm";

export class AppUser1705400003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app_user (
        id uniqueidentifier NOT NULL DEFAULT NEWID(),
        email nvarchar(255) NOT NULL,
        role nvarchar(32) NOT NULL,
        createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_app_user_id PRIMARY KEY (id),
        CONSTRAINT UQ_app_user_email UNIQUE (email)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE app_user");
  }
}
