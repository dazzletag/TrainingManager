import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Assignment } from "./Assignment";

@Entity()
export class Evidence {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Assignment, (assignment) => assignment.evidence, {
    eager: true,
    onDelete: "CASCADE",
  })
  assignment!: Assignment;

  @Column()
  type!: string;

  @Column()
  source!: string;

  @Column()
  validFrom!: Date;

  @Column()
  validTo!: Date;

  @Column()
  uploadedFileKey!: string;

  @Column()
  verifiedBy!: string;

  @Column({ default: 0 })
  confidenceLevel!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
