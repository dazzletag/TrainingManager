import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { TrainingRequirement } from "./TrainingRequirement";
import { Role } from "./Role";

@Entity("training_requirement_group")
@Index(["requirementId", "roleId"], { unique: true })
export class TrainingRequirementGroup {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uniqueidentifier")
  requirementId!: string;

  @Column("uniqueidentifier")
  roleId!: string;

  @ManyToOne(() => TrainingRequirement, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requirementId" })
  requirement!: TrainingRequirement;

  @ManyToOne(() => Role, { onDelete: "CASCADE" })
  @JoinColumn({ name: "roleId" })
  role!: Role;

  @Column("int")
  requiredLevel!: number;

  @Column("bit")
  mandatory!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
