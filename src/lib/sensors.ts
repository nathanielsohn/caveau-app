/** Box-Muller transform — returns a sample from a normal distribution */
function gaussian(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

export interface SensorSnapshot {
  temperature: number;
  humidity: number;
  vibration: number;
  lightLux: number;
  timestamp: Date;
}

/** Generate a single simulated sensor reading based on the current time */
export function simulateReading(date?: Date): SensorSnapshot {
  const now = date ?? new Date();
  const hour = now.getHours() + now.getMinutes() / 60;

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
    timestamp: now,
  };
}

/** Alert thresholds */
export const THRESHOLDS = {
  temp: { min: 50, max: 59 },
  humidity: { min: 55, max: 75 },
  vibration: { max: 0.5 },
} as const;

export type AlertType = "temperature" | "humidity" | "vibration" | "light";
export type Severity = "info" | "warning" | "critical";

export interface LiveAlert {
  id: string;
  type: AlertType;
  severity: Severity;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

/** Check a sensor reading against thresholds and return any alerts */
export function checkThresholds(reading: SensorSnapshot): LiveAlert[] {
  const alerts: LiveAlert[] = [];
  const ts = reading.timestamp;

  if (reading.temperature > THRESHOLDS.temp.max) {
    alerts.push({
      id: `live-${ts.getTime()}-temp-high`,
      type: "temperature",
      severity: reading.temperature > 62 ? "critical" : "warning",
      message: `Temperature high: ${reading.temperature.toFixed(1)}°F (max ${THRESHOLDS.temp.max}°F)`,
      timestamp: ts,
      resolved: false,
    });
  }
  if (reading.temperature < THRESHOLDS.temp.min) {
    alerts.push({
      id: `live-${ts.getTime()}-temp-low`,
      type: "temperature",
      severity: reading.temperature < 47 ? "critical" : "warning",
      message: `Temperature low: ${reading.temperature.toFixed(1)}°F (min ${THRESHOLDS.temp.min}°F)`,
      timestamp: ts,
      resolved: false,
    });
  }

  if (reading.humidity > THRESHOLDS.humidity.max) {
    alerts.push({
      id: `live-${ts.getTime()}-hum-high`,
      type: "humidity",
      severity: "warning",
      message: `Humidity high: ${reading.humidity.toFixed(1)}% (max ${THRESHOLDS.humidity.max}%)`,
      timestamp: ts,
      resolved: false,
    });
  }
  if (reading.humidity < THRESHOLDS.humidity.min) {
    alerts.push({
      id: `live-${ts.getTime()}-hum-low`,
      type: "humidity",
      severity: "warning",
      message: `Humidity low: ${reading.humidity.toFixed(1)}% (min ${THRESHOLDS.humidity.min}%)`,
      timestamp: ts,
      resolved: false,
    });
  }

  if (reading.vibration > THRESHOLDS.vibration.max) {
    alerts.push({
      id: `live-${ts.getTime()}-vib`,
      type: "vibration",
      severity: reading.vibration > 1.0 ? "critical" : "warning",
      message: `Vibration spike: ${reading.vibration.toFixed(2)} mm/s (max ${THRESHOLDS.vibration.max} mm/s)`,
      timestamp: ts,
      resolved: false,
    });
  }

  return alerts;
}
