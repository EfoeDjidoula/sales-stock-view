import { describe, it, expect } from "vitest";
import { isDarkAt, resolveDark } from "./theme";
describe("auto theme", () => {
  it("is dark at 19h and 6h", () => { expect(isDarkAt(19)).toBe(true); expect(isDarkAt(6)).toBe(true); });
  it("is light at 7h and 18h", () => { expect(isDarkAt(7)).toBe(false); expect(isDarkAt(18)).toBe(false); });
  it("fixed modes ignore the hour", () => {
    const noon = new Date(2026, 0, 1, 12);
    expect(resolveDark("dark", noon)).toBe(true);
    expect(resolveDark("light", new Date(2026, 0, 1, 23))).toBe(false);
  });
});
