import { RequestRateLimiter } from "@/lib/request-rate-limiter";

describe("request rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clamps requested rate to max 10 requests/sec", async () => {
    const limiter = new RequestRateLimiter(999);

    await limiter.wait();

    const secondWait = limiter.wait();
    let settled = false;
    secondWait.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await secondWait;
    expect(settled).toBe(true);
  });

  it("enforces spacing for lower rates", async () => {
    const limiter = new RequestRateLimiter(2);

    await limiter.wait();

    const secondWait = limiter.wait();
    let settled = false;
    secondWait.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await secondWait;
    expect(settled).toBe(true);
  });
});
