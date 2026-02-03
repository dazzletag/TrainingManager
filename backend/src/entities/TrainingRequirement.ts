import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Role } from "./Role";

@Entity()
export class TrainingRequirement {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column("text")
  description!: string;

  @Column("int")
  validityPeriodMonths!: number;

  @Column("int", { default: 1 })
  requiredLevel!: number;

  @Column("int", { default: 3 })
  importanceLevel!: number;

  @Column("int", { default: 8 })
  minimumAttendees!: number;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ nullable: true })
  category?: string;

  @Column({ nullable: true })
  section?: string;

  @ManyToMany(() => Role, (role) => role.trainingRequirements, {
    cascade: ["insert"],
  })
  @JoinTable({
    name: "training_requirement_roles_role",
    joinColumn: { name: "trainingRequirementId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "roleId", referencedColumnName: "id" },
  })
  roles!: Role[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
