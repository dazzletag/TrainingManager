import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  who!: string;

  @Column()
  what!: string;

  @Column()
  when!: Date;

  @Column("text")
  why!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
