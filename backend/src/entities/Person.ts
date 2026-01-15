import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Role } from "./Role";
import { Assignment } from "./Assignment";

@Entity()
export class Person {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  externalId!: string;

  @Column()
  fullName!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  employmentStatus!: string;

  @Column()
  homeLocation!: string;

  @Column({ default: true })
  isActive!: boolean;

  @ManyToOne(() => Role, { eager: true })
  role!: Role;

  @ManyToMany(() => Role)
  @JoinTable({
    name: "person_group",
    joinColumn: { name: "personId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "roleId", referencedColumnName: "id" },
  })
  groups!: Role[];

  @OneToMany(() => Assignment, (assignment) => assignment.person)
  assignments!: Assignment[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
