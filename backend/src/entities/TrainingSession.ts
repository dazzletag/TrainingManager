import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { SessionAssignment } from "./SessionAssignment";

@Entity()
export class TrainingSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ type: "date" })
  day1!: Date;

  @Column({ type: "date" })
  day2!: Date;

  @Column({ type: "varchar", length: 5, default: "09:15" })
  startTime!: string;

  @Column({ type: "varchar", length: 5, default: "15:45" })
  endTime!: string;

  @Column({ default: "Mandatory Training" })
  type!: string;

  @OneToMany(() => SessionAssignment, (assignment) => assignment.session, { cascade: true })
  assignments!: SessionAssignment[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
