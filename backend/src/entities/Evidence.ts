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

  @Column({ nullable: true, type: "nvarchar", length: 255, default: null })
  type?: string;

  @Column()
  source!: string;

  @Column()
  validFrom!: Date;

  @Column()
  validTo!: Date;

  @Column({ nullable: true, type: "nvarchar", length: 255, default: null })
  uploadedFileKey?: string;

  @Column()
  verifiedBy!: string;

  @Column({ default: 0 })
  confidenceLevel!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
