import { MAX_GOOGLE_RPS } from "./execution-limits";

export class RequestRateLimiter {
  private readonly minIntervalMs: number;
  private nextAllowedAt = 0;

  constructor(requestsPerSecond: number) {
    const clamped = Math.max(1, Math.min(MAX_GOOGLE_RPS, Math.floor(requestsPerSecond)));
    this.minIntervalMs = Math.ceil(1000 / clamped);
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const waitMs = this.nextAllowedAt - now;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextAllowedAt = Date.now() + this.minIntervalMs;
  }
}
