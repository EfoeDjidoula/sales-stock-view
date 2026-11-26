import { describe, expect, it } from "vitest";
import { compartmentFill, productTone } from "@/lib/tankerVisual";

describe("camion-citerne visuel", () => {
  it("remplit chaque compartiment selon son volume sans dépasser sa capacité", () => {
    expect(compartmentFill(5000, 10000)).toBe(0.5);
    expect(compartmentFill(12000, 10000)).toBe(1);
    expect(compartmentFill(-100, 10000)).toBe(0);
    expect(compartmentFill(1000, 0)).toBe(0);
  });

  it("utilise les couleurs métier Super et Gasoil", () => {
    expect(productTone("SUPER")).toBe("super");
    expect(productTone("Gasoil")).toBe("gasoil");
    expect(productTone("Diesel")).toBe("gasoil");
    expect(productTone()).toBe("muted");
  });
});
