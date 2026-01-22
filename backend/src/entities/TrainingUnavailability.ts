import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Person } from "./Person";

@Entity({ name: "training_unavailability" })
export class TrainingUnavailability {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @OneToOne(() => Person, { eager: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "personId" })
  person!: Person;

  @Column({ nullable: true })
  reason?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
