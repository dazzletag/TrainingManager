import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
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

  @Column({ default: true })
  mandatory!: boolean;

  @Column({ nullable: true })
  category?: string;

  @ManyToMany(() => Role, (role) => role.trainingRequirements, {
    cascade: ["insert"],
  })
  roles!: Role[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
