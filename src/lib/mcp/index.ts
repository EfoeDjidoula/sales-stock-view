import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStations from "./tools/list-stations";
import listClients from "./tools/list-clients";
import listSuppliers from "./tools/list-suppliers";
import listPriceStructures from "./tools/list-price-structures";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref
// (Vite inlines this literal at build time, keeping the entry import-safe).
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "yatt-energy-mcp",
  title: "YATT & CO ENERGY MCP",
  version: "0.1.0",
  instructions:
    "Tools for the YATT & CO ENERGY station management app (Benin). " +
    "Read stations, clients, suppliers, and fuel price structures for the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listStations, listClients, listSuppliers, listPriceStructures],
});
