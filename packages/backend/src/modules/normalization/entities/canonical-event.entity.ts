import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StationCode } from '../../../common/enums/station-code.enum.js';
import { SourceType } from '../../../common/enums/source-type.enum.js';
import { CanonicalEventStatus } from '../../../common/enums/status.enum.js';
import { CollectionRun } from '../../collection/entities/collection-run.entity.js';

/**
 * Normalised representation of a single production event.
 *
 * Every raw source record is transformed into a CanonicalEvent.
 * The original rawPayload is preserved for audit and provenance.
 *
 * Dedup rule: (sourceType, sourceRecordId) must be unique.
 * Duplicates are stored with status=DUPLICATE, not dropped.
 */
@Entity('canonical_events')
@Index(['batchId', 'stationCode'])
@Index(['sourceType', 'sourceRecordId'], { unique: false }) // enforced in code, not DB (to allow DUPLICATE records)
export class CanonicalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  batchId: string;

  /** Joined from API master data; null when not yet resolved */
  @Column({ type: 'varchar', nullable: true })
  workOrderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  lineId: string | null;

  @Column({ type: 'varchar' })
  stationCode: StationCode;

  @Column({ type: 'integer' })
  quantity: number;

  @Index()
  @Column({ type: 'timestamptz' })
  eventTime: Date;

  @Column({ type: 'varchar' })
  sourceType: SourceType;

  /** Stable ID from the originating source system */
  @Column({ type: 'varchar' })
  sourceRecordId: string;

  /** Which collection run brought this record in (null for streaming sources like MQTT) */
  @Column({ type: 'uuid', nullable: true })
  collectionRunId: string | null;

  @ManyToOne(() => CollectionRun, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'collectionRunId' })
  collectionRun?: CollectionRun | null;

  /**
   * ACCEPTED  — canonical record used for production state
   * DUPLICATE — same (sourceType, sourceRecordId) seen before; kept for audit
   * CONFLICT  — different quantity for same (batchId, stationCode) from lower-priority source
   */
  @Column({ type: 'varchar', default: CanonicalEventStatus.ACCEPTED })
  status: CanonicalEventStatus;

  /** Original record as received from the source — never mutated */
  @Column({ type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
