import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { TrainingRequirement } from "./TrainingRequirement";
import { Person } from "./Person";

@Entity()
export class Role {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  externalId!: string;

  @Column()
  name!: string;

  @Column()
  category!: string;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => Person, (person) => person.role)
  people!: Person[];

  @ManyToMany(() => TrainingRequirement, (requirement) => requirement.roles)
  trainingRequirements!: TrainingRequirement[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
