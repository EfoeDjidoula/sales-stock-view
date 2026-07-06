import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List customer accounts (clients). Optionally filter to active clients only.",
  inputSchema: {
    active_only: z
      .boolean()
      .optional()
      .describe("When true, only return active clients."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let query = supabaseForUser(ctx)
      .from("clients")
      .select("id, name, contact_name, email, phone, address, tax_id, is_active")
      .order("name");
    if (active_only) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { clients: data },
    };
  },
});
