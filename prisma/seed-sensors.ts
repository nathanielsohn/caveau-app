import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Inline sensor simulation (mirrors src/lib/sensors.ts) ──────────────

function gaussian(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function simulateReading(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;

  const temperature = 55.0 + Math.sin(((hour - 5) * Math.PI) / 12) + gaussian(0, 0.1);
  const humidity = 65.0 - (temperature - 55.0) * 2.0 + gaussian(0, 0.3);
  const vibration =
    0.1 + (Math.random() < 0.005 ? Math.random() * 1.5 : Math.abs(gaussian(0, 0.02)));
  const lightLux =
    Math.random() < 0.001 ? Math.random() * 150 + 50 : Math.max(0, gaussian(0, 0.5));

  return {
    temperature: Math.round(temperature * 100) / 100,
    humidity: Math.round(humidity * 100) / 100,
    vibration: Math.round(vibration * 1000) / 1000,
    lightLux: Math.round(lightLux * 100) / 100,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

const DAYS = 30;
const INTERVAL_MINUTES = 5;
const READINGS_PER_DAY = (24 * 60) / INTERVAL_MINUTES; // 288
const CHUNK_SIZE = 5000;

async function main() {
  console.log('📡 Seeding sensor readings (30 days)...');

  // Clear existing readings
  await prisma.sensorReading.deleteMany();

  const lockers = await prisma.locker.findMany();
  if (lockers.length === 0) {
    console.error('No lockers found — run seed.ts first');
    process.exit(1);
  }

  const totalReadings = lockers.length * DAYS * READINGS_PER_DAY;
  console.log(
    `  Generating ${totalReadings.toLocaleString()} readings for ${lockers.length} lockers...`
  );

  const now = Date.now();
  const startTime = now - DAYS * 24 * 60 * 60 * 1000;

  let batch: {
    lockerId: string;
    temperature: number;
    humidity: number;
    vibration: number;
    lightLux: number;
    timestamp: Date;
  }[] = [];
  let inserted = 0;

  for (const locker of lockers) {
    for (let i = 0; i < DAYS * READINGS_PER_DAY; i++) {
      const timestamp = new Date(startTime + i * INTERVAL_MINUTES * 60 * 1000);
      const reading = simulateReading(timestamp);

      batch.push({
        lockerId: locker.id,
        temperature: reading.temperature,
        humidity: reading.humidity,
        vibration: reading.vibration,
        lightLux: reading.lightLux,
        timestamp,
      });

      if (batch.length >= CHUNK_SIZE) {
        await prisma.sensorReading.createMany({ data: batch });
        inserted += batch.length;
        process.stdout.write(
          `\r  Inserted ${inserted.toLocaleString()} / ${totalReadings.toLocaleString()} readings`
        );
        batch = [];
      }
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await prisma.sensorReading.createMany({ data: batch });
    inserted += batch.length;
  }

  console.log(
    `\n  ✓ Inserted ${inserted.toLocaleString()} sensor readings`
  );
  console.log('\n✅ Sensor seed complete!');
}

main()
  .catch((e) => {
    console.error('Sensor seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
