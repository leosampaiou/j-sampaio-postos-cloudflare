import { describe, expect, it } from "vitest";
import {
  LOGIN_IP_REQUEST_LIMIT,
  LOGIN_LOCKOUT_MAX_SECONDS,
  LOGIN_PAIR_REQUEST_LIMIT,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  progressiveLockoutSeconds,
} from "./loginRateLimitPolicy";

describe("login rate-limit policy", () => {
  it("uses a bounded 15-minute request window and distinct IP/pair thresholds", () => {
    expect(LOGIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(LOGIN_PAIR_REQUEST_LIMIT).toBe(8);
    expect(LOGIN_IP_REQUEST_LIMIT).toBe(60);
  });

  it("does not delay requests within the threshold and starts progressive delays after it", () => {
    expect(progressiveLockoutSeconds(8, LOGIN_PAIR_REQUEST_LIMIT)).toBe(0);
    expect(progressiveLockoutSeconds(9, LOGIN_PAIR_REQUEST_LIMIT)).toBe(30);
    expect(progressiveLockoutSeconds(10, LOGIN_PAIR_REQUEST_LIMIT)).toBe(60);
    expect(progressiveLockoutSeconds(11, LOGIN_PAIR_REQUEST_LIMIT)).toBe(120);
  });

  it("caps the delay and rejects invalid counters safely", () => {
    expect(progressiveLockoutSeconds(100, LOGIN_PAIR_REQUEST_LIMIT)).toBe(
      LOGIN_LOCKOUT_MAX_SECONDS
    );
    expect(progressiveLockoutSeconds(-1, 8)).toBe(0);
    expect(progressiveLockoutSeconds(9.5, 8)).toBe(0);
  });
});
