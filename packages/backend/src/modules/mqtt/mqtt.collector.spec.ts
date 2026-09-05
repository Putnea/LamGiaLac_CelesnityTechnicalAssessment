import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MqttCollector } from './mqtt.collector.js';
import { ConfigService } from '@nestjs/config';
import { NormalizationService } from '../normalization/normalization.service.js';
import { CanonicalEvent } from '../normalization/entities/canonical-event.entity.js';
import { Repository } from 'typeorm';
import { StationCode } from '../../common/enums/station-code.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';

describe('MqttCollector', () => {
  let collector: MqttCollector;
  let configMock: Partial<ConfigService>;
  let normalizationMock: Partial<NormalizationService>;
  let eventRepoMock: Partial<Repository<CanonicalEvent>>;

  beforeEach(() => {
    configMock = {
      get: vi.fn().mockImplementation((key: string, defaultVal: string) => {
        if (key === 'MQTT_ENABLED') return 'true';
        if (key === 'MQTT_BROKER_URL') return 'mqtt://localhost:1883';
        return defaultVal;
      }),
    };
    normalizationMock = {
      normalizeMqttEvent: vi.fn().mockResolvedValue('saved'),
    };
    eventRepoMock = {
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: 'evt-mqtt-1' })),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      findOne: vi.fn().mockResolvedValue(null),
    };

    collector = new MqttCollector(
      configMock as ConfigService,
      normalizationMock as NormalizationService,
      eventRepoMock as Repository<CanonicalEvent>,
    );
  });

  describe('handleMessage', () => {
    it('should correctly ingest valid telemetry payload and delegate to normalizeMqttEvent', async () => {
      const payload = {
        batchId: 'BATCH-003',
        lineId: 'LINE-B',
        stationCode: 'WASHING',
        timestamp: '2026-09-02T10:00:00.000Z',
        temperature: 61.2,
        rpm: 45.0,
        cyclePhase: 'WASH',
        machineId: 'WASH-B-01',
        sourceRecordId: 'MQTT-BATCH-003-WASHING-1-123456',
      };

      const buffer = Buffer.from(JSON.stringify(payload));
      await collector.handleMessage(buffer);

      expect(normalizationMock.normalizeMqttEvent).toHaveBeenCalledWith(payload);
    });

    it('should ignore malformed or empty payloads gracefully', async () => {
      await collector.handleMessage(Buffer.from('not-valid-json'));
      expect(normalizationMock.normalizeMqttEvent).not.toHaveBeenCalled();
    });
  });

  describe('Graceful degradation', () => {
    it('should not connect when MQTT_ENABLED is false', () => {
      vi.spyOn(configMock, 'get').mockImplementation((key: string) => {
        if (key === 'MQTT_ENABLED') return 'false';
        return '';
      });

      const spyStart = vi.spyOn(collector, 'startClient');
      collector.onModuleInit();

      expect(spyStart).not.toHaveBeenCalled();
      expect(collector.getStatus().enabled).toBe(false);
    });
  });
});
