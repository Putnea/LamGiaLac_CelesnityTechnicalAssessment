import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DataSource } from '../../sources/entities/data-source.entity.js';
import { CollectionStatus } from '../../../common/enums/status.enum.js';
import { SourceType } from '../../../common/enums/source-type.enum.js';

export interface CollectionError {
  timestamp: string;
  message: string;
  context?: string; // e.g. page number, record id — never credential info
}

/**
 * Records every collection run attempt for a source.
 * Used for monitoring, error inspection, and provenance.
 */
@Entity('collection_runs')
export class CollectionRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  sourceId: string;

  @ManyToOne(() => DataSource, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'sourceId' })
  source: DataSource;

  @Column({ type: 'varchar' })
  sourceType: SourceType;

  @Column({ type: 'varchar', default: CollectionStatus.RUNNING })
  status: CollectionStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Duration in milliseconds — null while still running */
  @Column({ type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ type: 'integer', default: 0 })
  recordsCollected: number;

  @Column({ type: 'integer', default: 0 })
  recordsFailed: number;

  /** Detailed error log — capped to prevent DB bloat */
  @Column({ type: 'jsonb', default: [] })
  errors: CollectionError[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
