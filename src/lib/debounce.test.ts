import { describe, it, expect, vi } from "vitest";
import { debounce } from "./debounce";
describe("debounce", () => {
  it("20 événements rapprochés = 1 seul rechargement", () => {
    vi.useFakeTimers(); const f = vi.fn(); const d = debounce(f, 1500);
    for (let i = 0; i < 20; i++) d();
    vi.advanceTimersByTime(1499); expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(f).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
