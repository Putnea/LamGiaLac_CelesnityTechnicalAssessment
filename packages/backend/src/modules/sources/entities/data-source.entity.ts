import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SourceType } from '../../../common/enums/source-type.enum.js';

/**
 * Represents a registered data source.
 *
 * Security rules:
 *   - encryptedCredentials is NEVER serialised in API responses (Exclude decorator)
 *   - Credentials are stored AES-256-CBC encrypted
 *   - The raw secret must never appear in logs or response bodies
 */
@Entity('data_sources')
export class DataSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'varchar' })
  type: SourceType;

  /**
   * Non-secret connection config (e.g. host, port, baseUrl, startUrl).
   * Stored as JSON — never contains passwords or tokens.
   */
  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;

  /**
   * AES-256-CBC encrypted credentials (e.g. { password, token }).
   * MUST NOT be returned in any API response or written to logs.
   */
  @Column({ type: 'text', nullable: true, select: false })
  encryptedCredentials: string | null;

  /**
   * The specific target selected for collection.
   * - API: endpoint path (e.g. '/receiving')
   * - CRAWLER: start URL
   * - DATABASE: table name
   * - MQTT: topic pattern
   */
  @Column({ type: 'varchar', nullable: true })
  selectedTarget: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastCollectedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastTestedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastTestResult: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
