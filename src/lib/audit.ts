import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "login" | "logout" | "country_switch" | "export" | "view_sensitive";

/** Journalise un événement applicatif (jamais bloquant). */
export async function logAudit(
  action: AuditAction,
  module: string,
  opts: { entityType?: string; entityId?: string; countryId?: string | null; details?: Record<string, unknown> } = {}
) {
  try {
    await supabase.rpc("log_audit_event", {
      _action: action,
      _module: module,
      _entity_type: opts.entityType ?? null,
      _entity_id: opts.entityId ?? null,
      _country_id: opts.countryId ?? null,
      _details: (opts.details ?? null) as never,
      _device: typeof navigator !== "undefined" ? navigator.userAgent : null,
    } as never);
  } catch {
    /* le journal ne doit jamais bloquer l'utilisateur */
  }
}
