import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { TrainingSession } from "./TrainingSession";
import { Person } from "./Person";

@Entity()
export class SessionAssignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => TrainingSession, (session) => session.assignments, {
    eager: true,
    onDelete: "CASCADE",
  })
  session!: TrainingSession;

  @ManyToOne(() => Person, {
    eager: true,
  })
  person!: Person;

  @Column({ type: "int" })
  day!: number;

  @Column()
  dropZoneId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
