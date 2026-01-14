import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Person } from "./Person";
import { TrainingRequirement } from "./TrainingRequirement";
import { Evidence } from "./Evidence";

@Entity()
export class Assignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Person, (person) => person.assignments, {
    eager: true,
  })
  person!: Person;

  @ManyToOne(() => TrainingRequirement, {
    eager: true,
  })
  requirement!: TrainingRequirement;

  @OneToMany(() => Evidence, (evidence) => evidence.assignment)
  evidence!: Evidence[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
