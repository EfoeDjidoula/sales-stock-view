import { describe, it, expect } from "vitest";
import { csvCell, csvRow } from "./csv";

describe("csvCell", () => {
  it("neutralise les formules", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
  });
  it("conserve nombres et texte normal", () => {
    expect(csvCell(-1500)).toBe("-1500");
    expect(csvCell("Station A")).toBe("Station A");
    expect(csvRow(["a;b", 2])).toBe("\"a;b\";2");
  });
});
