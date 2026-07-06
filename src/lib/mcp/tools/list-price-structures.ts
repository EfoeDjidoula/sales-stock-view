import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_price_structures",
  title: "List price structures",
  description:
    "List fuel price structures by effective period, including Super and Gasoil selling prices.",
  inputSchema: {
    country: z
      .string()
      .optional()
      .describe("Filter by country code/name (e.g. Benin)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ country }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let query = supabaseForUser(ctx)
      .from("price_structures")
      .select("id, country, effective_date, label, super_price, gasoil_price, is_active")
      .order("effective_date", { ascending: false });
    if (country) query = query.eq("country", country);
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { price_structures: data },
    };
  },
});
