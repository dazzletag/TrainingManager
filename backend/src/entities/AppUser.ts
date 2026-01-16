import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("app_user")
export class AppUser {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "nvarchar", length: 255 })
  email!: string;

  @Column({ type: "nvarchar", length: 32 })
  role!: "admin" | "manager";

  @CreateDateColumn({ type: "datetime2", default: () => "SYSUTCDATETIME()" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime2", default: () => "SYSUTCDATETIME()" })
  updatedAt!: Date;
}
