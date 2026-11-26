import { describe, it, expect } from "vitest";
import { legacyRoleFor } from "./businessRoles";

describe("legacyRoleFor", () => {
  it("client admin is admin", () => expect(legacyRoleFor("client_admin")).toBe("admin"));
  it("station manager is manager", () => expect(legacyRoleFor("station_manager")).toBe("manager"));
  it("gérant is operator", () => expect(legacyRoleFor("gerant")).toBe("operator"));
  it("custom role defaults to operator", () => expect(legacyRoleFor("custom_x")).toBe("operator"));
});
