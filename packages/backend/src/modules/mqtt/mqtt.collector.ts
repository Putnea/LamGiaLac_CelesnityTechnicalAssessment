import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mqtt, { MqttClient } from 'mqtt';
import { NormalizationService } from '../normalization/normalization.service.js';
import { StationCode } from '../../common/enums/station-code.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { CanonicalEventStatus } from '../../common/enums/status.enum.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanonicalEvent } from '../normalization/entities/canonical-event.entity.js';

export interface MqttTelemetryMessage {
  batchId: string;
  lineId?: string;
  stationCode: 'WASHING' | 'DRYING' | string;
  timestamp: string;
  temperature?: number;
  rpm?: number;
  cyclePhase?: string;
  machineId?: string;
  sourceRecordId: string;
  [key: string]: unknown;
}

@Injectable()
export class MqttCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttCollector.name);
  private client: MqttClient | null = null;
  private isConnected = false;
  private lastLoggedError = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly normalization: NormalizationService,
    @InjectRepository(CanonicalEvent)
    private readonly eventRepo: Repository<CanonicalEvent>,
  ) { }

  onModuleInit() {
    const isEnabled = this.config.get<string>('MQTT_ENABLED', 'false') === 'true';
    if (!isEnabled) {
      this.logger.log('MQTT Collector is disabled (MQTT_ENABLED=false). Gracefully degraded.');
      return;
    }

    this.startClient();
  }

  onModuleDestroy() {
    if (this.client) {
      this.logger.log('Disconnecting MQTT Collector...');
      this.client.end(true);
      this.client = null;
    }
  }

  startClient(customBrokerUrl?: string, customTopic?: string) {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
    }

    const brokerUrl =
      customBrokerUrl ||
      this.config.get<string>('MQTT_BROKER_URL', 'mqtt://localhost:1883');
    const topic =
      customTopic ||
      this.config.get<string>(
        'MQTT_TOPIC_PATTERN',
        'factory/line/+/station/+/batch/+'
      );

    this.logger.log(`Connecting MQTT Collector to ${brokerUrl}...`);

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: `celesnity-collector-${Date.now()}`,
        clean: true,
        reconnectPeriod: 10000,
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`MQTT Collector connected to ${brokerUrl}. Subscribing to ${topic}...`);
        this.client?.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            this.logger.error(`Failed to subscribe to MQTT topic ${topic}: ${err.message}`);
          } else {
            this.logger.log(`Subscribed to telemetry topic pattern: ${topic}`);
          }
        });
      });

      this.client.on('message', (_receivedTopic, payload) => {
        this.handleMessage(payload);
      });

      this.client.on('error', (err) => {
        const now = Date.now();
        if (now - this.lastLoggedError > 30000) {
          this.logger.warn(`MQTT connection error: ${err.message} (retrying in background)`);
          this.lastLoggedError = now;
        }
      });

      this.client.on('close', () => {
        if (this.isConnected) {
          this.logger.warn('MQTT connection closed. Will attempt reconnect...');
          this.isConnected = false;
        }
      });
    } catch (err: any) {
      this.logger.error(`Error initializing MQTT client: ${err.message}`);
    }
  }

  stopClient() {
    if (this.client) {
      this.logger.log('Disconnecting MQTT Collector stream...');
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Process raw MQTT message, parse JSON, and store as CanonicalEvent via NormalizationService
   */
  async handleMessage(payloadBuffer: Buffer): Promise<void> {
    try {
      const rawText = payloadBuffer.toString('utf8');
      const data: MqttTelemetryMessage = JSON.parse(rawText);

      if (!data.batchId || !data.stationCode || !data.sourceRecordId) {
        this.logger.warn('Received invalid MQTT payload (missing batchId/stationCode/sourceRecordId)');
        return;
      }

      const result = await this.normalization.normalizeMqttEvent(data);
      if (result === 'saved') {
        this.logger.debug(
          `Ingested MQTT telemetry for batch ${data.batchId} station ${data.stationCode} (machine: ${data.machineId || 'N/A'})`
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to process MQTT message: ${err.message}`);
    }
  }

  getStatus() {
    return {
      enabled: this.config.get<string>('MQTT_ENABLED', 'false') === 'true',
      isStreaming: !!this.client,
      connected: this.isConnected,
      brokerUrl: this.config.get<string>('MQTT_BROKER_URL', 'mqtt://localhost:1883'),
    };
  }
}
