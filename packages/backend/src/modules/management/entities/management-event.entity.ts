import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum ManagementEventType {
  ACKNOWLEDGE = 'ACKNOWLEDGE',
  BLOCK = 'BLOCK',
  RESUME = 'RESUME',
  NOTE = 'NOTE',
}

/**
 * Append-only management event store.
 * Never modifies collected production data — only adds metadata.
 * BLOCK/RESUME events affect batch state computation.
 */
@Entity('management_events')
@Index(['batchId', 'createdAt'])
export class ManagementEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  batchId: string;

  @Column({ type: 'varchar' })
  eventType: ManagementEventType;

  /** Seeded actor identifier — no full auth required */
  @Column({ type: 'varchar', default: 'manager-1' })
  actor: string;

  /** Seeded organization */
  @Column({ type: 'varchar', default: 'celesnity-org' })
  organizationId: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
