import { describe, it, expect } from "vitest";
import { NAV_POLES, ALL_NAV_GROUPS, findPoleOfTab, poleBadgeTotal, formatBadge } from "./navigation";

describe("menu latéral", () => {
  it("compte exactement 6 pôles métiers numérotés de 1 à 6", () => {
    expect(NAV_POLES.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("place chaque onglet dans un seul groupe", () => {
    const tabs = ALL_NAV_GROUPS.flatMap((g) => g.tabs);
    expect(new Set(tabs).size).toBe(tabs.length);
  });

  it("garde l'administration et le support hors des 6 pôles", () => {
    expect(findPoleOfTab("droits")?.id).toBe("admin");
    expect(findPoleOfTab("support")?.id).toBe("support");
    expect(findPoleOfTab("anti_fraude")?.number).toBe(4);
  });

  it("additionne les pastilles des seuls onglets visibles", () => {
    const audit = NAV_POLES.find((p) => p.id === "audit")!;
    const badges = { reconciliation: 5, anti_fraude: 4 };
    expect(poleBadgeTotal(audit, badges, () => true)).toBe(9);
    expect(poleBadgeTotal(audit, badges, (t) => t !== "anti_fraude")).toBe(5);
  });

  it("plafonne l'affichage à 99+", () => {
    expect(formatBadge(120)).toBe("99+");
    expect(formatBadge(7)).toBe("7");
  });
});
