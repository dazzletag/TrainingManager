import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from " typeorm\;

@Entity(\training_requirement_suppression\)
export class TrainingRequirementSuppression {
 @PrimaryGeneratedColumn(\uuid\)
 id!: string;

 @Column({ nullable: true })
 @Index()
 fieldIdentifier?: string;

 @Column()
 @Index()
 name!: string;

 @CreateDateColumn()
 createdAt!: Date;
}
