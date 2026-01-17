import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("recommendation_settings")
export class RecommendationSettings {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("int", { default: 60 })
  atRiskWindowDays!: number;

  @Column("int", { default: 8 })
  minimumAttendeesDefault!: number;

  @Column("int", { default: 2 })
  importanceWeightMultiplier!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
