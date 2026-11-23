export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_PAIR_REQUEST_LIMIT = 8;
export const LOGIN_IP_REQUEST_LIMIT = 60;
export const LOGIN_LOCKOUT_BASE_SECONDS = 30;
export const LOGIN_LOCKOUT_MAX_SECONDS = 15 * 60;

/**
 * Exponential backoff after the allowed request count is exceeded.
 * The first blocked request receives the base delay; the delay is capped.
 */
export function progressiveLockoutSeconds(
  requestCount: number,
  threshold: number,
  baseSeconds = LOGIN_LOCKOUT_BASE_SECONDS,
  maxSeconds = LOGIN_LOCKOUT_MAX_SECONDS
): number {
  if (
    !Number.isInteger(requestCount) ||
    !Number.isInteger(threshold) ||
    requestCount <= threshold
  )
    return 0;

  const exponent = Math.max(0, requestCount - threshold - 1);
  return Math.min(maxSeconds, baseSeconds * 2 ** exponent);
}
