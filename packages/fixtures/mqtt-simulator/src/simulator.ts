import mqtt, { MqttClient } from 'mqtt';

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const PUBLISH_INTERVAL_MS = 5000;

export interface TelemetryPayload {
  batchId: string;
  lineId: string;
  stationCode: 'WASHING' | 'DRYING';
  timestamp: string;
  temperature: number;
  rpm: number;
  cyclePhase: string;
  machineId: string;
  sourceRecordId: string;
}

export interface Scenario {
  batchId: string;
  lineId: string;
  stationCode: 'WASHING' | 'DRYING';
  machineId: string;
  phases: string[];
  baseTemp: number;
  baseRpm: number;
}

// Active simulation scenarios
const SCENARIOS: Scenario[] = [
  {
    batchId: 'BATCH-003',
    lineId: 'LINE-B',
    stationCode: 'WASHING',
    machineId: 'WASH-B-01',
    phases: ['FILL', 'WASH', 'RINSE', 'SPIN', 'DONE'],
    baseTemp: 60,
    baseRpm: 0,
  },
  {
    batchId: 'BATCH-004',
    lineId: 'LINE-B',
    stationCode: 'DRYING',
    machineId: 'DRY-B-01',
    phases: ['HEAT', 'TUMBLE', 'COOL', 'DONE'],
    baseTemp: 80,
    baseRpm: 45,
  },
];

// Track phase index per scenario
const phaseIndexes: number[] = SCENARIOS.map(() => 0);
let msgCounter = 0;
let lastErrorLogged = 0;

function buildPayload(scenario: Scenario, phaseIdx: number): TelemetryPayload {
  const phase = scenario.phases[phaseIdx % scenario.phases.length];
  const tempVariance = (Math.random() - 0.5) * 4;
  const rpmVariance = (Math.random() - 0.5) * 5;
  msgCounter++;

  return {
    batchId: scenario.batchId,
    lineId: scenario.lineId,
    stationCode: scenario.stationCode,
    timestamp: new Date().toISOString(),
    temperature: parseFloat((scenario.baseTemp + tempVariance).toFixed(1)),
    rpm: parseFloat((scenario.baseRpm + rpmVariance).toFixed(1)),
    cyclePhase: phase,
    machineId: scenario.machineId,
    sourceRecordId: `MQTT-${scenario.batchId}-${scenario.stationCode}-${msgCounter}-${Date.now()}`,
  };
}

function connect(): void {
  const client: MqttClient = mqtt.connect(BROKER_URL, {
    clientId: `celesnity-simulator-${Date.now()}`,
    clean: true,
    reconnectPeriod: 10000,
    connectTimeout: 5000,
  });

  client.on('connect', () => {
    console.log(`[mqtt-simulator] (TypeScript) Connected to ${BROKER_URL}`);

    setInterval(() => {
      SCENARIOS.forEach((scenario, i) => {
        const payload = buildPayload(scenario, phaseIndexes[i]);
        const topic = `factory/line/${scenario.lineId}/station/${scenario.stationCode}/batch/${scenario.batchId}`;

        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) {
            console.error(`[mqtt-simulator] Publish error on ${topic}:`, err.message);
          } else {
            console.log(
              `[mqtt-simulator] Published to ${topic} | phase=${payload.cyclePhase} | temp=${payload.temperature}°C`
            );
          }
        });

        // Advance phase
        phaseIndexes[i] = (phaseIndexes[i] + 1) % scenario.phases.length;
      });
    }, PUBLISH_INTERVAL_MS);
  });

  client.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLogged > 30000) {
      console.log(`[mqtt-simulator] MQTT Broker offline at ${BROKER_URL} (optional service)`);
      lastErrorLogged = now;
    }
  });
}

connect();
