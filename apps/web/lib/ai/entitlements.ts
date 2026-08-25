type Entitlements = {
  maxMessagesPerHour: number;
};

const DEFAULT_MAX_MESSAGES_PER_HOUR = 100;
const MIN_MAX_MESSAGES_PER_HOUR = 1;
const MAX_MAX_MESSAGES_PER_HOUR = 10_000;

function getMaxMessagesPerHour(): number {
  const envValue = process.env.MAX_MESSAGES_PER_HOUR;
  if (envValue === undefined || envValue === "") {
    return DEFAULT_MAX_MESSAGES_PER_HOUR;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isNaN(parsed)) {
    console.warn(
      `Invalid MAX_MESSAGES_PER_HOUR value "${envValue}", using default ${DEFAULT_MAX_MESSAGES_PER_HOUR}`
    );
    return DEFAULT_MAX_MESSAGES_PER_HOUR;
  }

  if (parsed < MIN_MAX_MESSAGES_PER_HOUR) {
    console.warn(
      `MAX_MESSAGES_PER_HOUR value ${parsed} below minimum ${MIN_MAX_MESSAGES_PER_HOUR}, clamping to ${MIN_MAX_MESSAGES_PER_HOUR}`
    );
    return MIN_MAX_MESSAGES_PER_HOUR;
  }

  if (parsed > MAX_MAX_MESSAGES_PER_HOUR) {
    console.warn(
      `MAX_MESSAGES_PER_HOUR value ${parsed} above maximum ${MAX_MAX_MESSAGES_PER_HOUR}, clamping to ${MAX_MAX_MESSAGES_PER_HOUR}`
    );
    return MAX_MAX_MESSAGES_PER_HOUR;
  }

  return parsed;
}

export function getEntitlements(): Entitlements {
  return {
    maxMessagesPerHour: getMaxMessagesPerHour(),
  };
}
