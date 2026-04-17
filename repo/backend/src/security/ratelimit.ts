const DEFAULT_WINDOW_MS = 60_000; // 1 minute

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * Evaluate a fixed-window rate limit decision.
 *
 * @param currentCount  Requests already counted in the current window.
 * @param windowStart   When the current window started.
 * @param now           The current time.
 * @param limitPerWindow Maximum requests allowed per window.
 * @param windowDurationMs Window size in milliseconds (default 60 s).
 */
export function evaluateRateLimit(
  currentCount: number,
  windowStart: Date,
  now: Date,
  limitPerWindow: number,
  windowDurationMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const windowExpiry = new Date(windowStart.getTime() + windowDurationMs);
  const inWindow = now < windowExpiry;

  if (!inWindow) {
    // Window has rolled over — this is the first request of the new window
    return {
      allowed: true,
      remaining: limitPerWindow - 1,
      resetAt: new Date(now.getTime() + windowDurationMs),
      limit: limitPerWindow,
    };
  }

  const projectedCount = currentCount + 1;
  const allowed = projectedCount <= limitPerWindow;
  return {
    allowed,
    remaining: Math.max(0, limitPerWindow - projectedCount),
    resetAt: windowExpiry,
    limit: limitPerWindow,
  };
}

/**
 * Return true if the window starting at windowStart has expired.
 */
export function isWindowExpired(
  windowStart: Date,
  now: Date,
  windowDurationMs: number = DEFAULT_WINDOW_MS,
): boolean {
  return now.getTime() >= windowStart.getTime() + windowDurationMs;
}

/**
 * Evaluate a login-throttle decision with a configurable minute-based window.
 */
export function evaluateLoginThrottle(
  failedAttempts: number,
  windowStart: Date,
  now: Date,
  maxAttempts: number,
  windowMinutes: number,
): RateLimitResult {
  return evaluateRateLimit(
    failedAttempts,
    windowStart,
    now,
    maxAttempts,
    windowMinutes * 60_000,
  );
}

const BURST_WINDOW_MS = 10_000; // 10-second burst sub-window layered on top of the 60s cap

/**
 * Evaluate a burst-rate decision. Layered on top of the per-minute cap so
 * clients cannot send their full minute quota in a single spike.
 */
export function evaluateBurstLimit(
  currentCount: number,
  windowStart: Date,
  now: Date,
  burstLimit: number,
  burstWindowMs: number = BURST_WINDOW_MS,
): RateLimitResult {
  return evaluateRateLimit(currentCount, windowStart, now, burstLimit, burstWindowMs);
}
