import { describe, it, expect } from "vitest";
import { detectBrandImageType, validateBrandFile, fitWithin, BRAND_IMAGE_MAX_BYTES } from "./brandImage";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const svg = new TextEncoder().encode("<svg xmlns=");

describe("brandImage", () => {
  it("reconnaît PNG et ICO par signature", () => {
    expect(detectBrandImageType(png)).toBe("png");
    expect(detectBrandImageType(ico)).toBe("ico");
  });
  it("refuse le SVG même renommé en image", () => {
    expect(detectBrandImageType(svg)).toBeNull();
    expect(validateBrandFile(100, svg)).toMatch(/Format non pris en charge/);
  });
  it("refuse un fichier de plus de 2 Mo", () => {
    expect(validateBrandFile(BRAND_IMAGE_MAX_BYTES + 1, png)).toMatch(/2 Mo/);
    expect(validateBrandFile(BRAND_IMAGE_MAX_BYTES, png)).toBeNull();
  });
  it("réduit un logo à 512 px sans déformer ni agrandir", () => {
    expect(fitWithin(2000, 1000, 512)).toEqual({ w: 512, h: 256 });
    expect(fitWithin(100, 50, 512)).toEqual({ w: 100, h: 50 });
    expect(fitWithin(256, 256, 64)).toEqual({ w: 64, h: 64 });
  });
});
