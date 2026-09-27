import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const TICKET_CATEGORIES = {
  incident: "Incident", bug: "Bug", assistance: "Assistance",
  configuration: "Configuration", evolution: "Demande d'évolution", other: "Autre",
} as const;
export const TICKET_PRIORITIES = {
  low: { label: "Faible", cls: "bg-muted text-muted-foreground border-border" },
  normal: { label: "Normale", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  high: { label: "Haute", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  critical: { label: "Critique", cls: "bg-destructive/15 text-destructive border-destructive/30" },
} as const;
export const TICKET_STATUSES = {
  new: { label: "Nouveau", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  assigned: { label: "Assigné", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  in_progress: { label: "En cours", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  waiting_client: { label: "En attente client", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  resolved: { label: "Résolu", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  closed: { label: "Fermé", cls: "bg-muted text-muted-foreground border-border" },
} as const;
export type TicketStatus = keyof typeof TICKET_STATUSES;
export type TicketPriority = keyof typeof TICKET_PRIORITIES;
export type TicketCategory = keyof typeof TICKET_CATEGORIES;

export interface Attachment { path: string; name: string; size: number }
export interface SupportTicket {
  id: string; ticket_number: string; tenant_id: string; country_id: string | null; station_id: string | null;
  module_key: string | null; category: TicketCategory; subject: string; description: string;
  priority: TicketPriority; status: TicketStatus; attachments: Attachment[];
  created_by: string; created_by_name: string | null; assigned_to: string | null; assigned_to_name: string | null;
  sla_hours: number; sla_due_at: string | null; first_response_at: string | null;
  resolved_at: string | null; closed_at: string | null; created_at: string; updated_at: string;
}
export interface TicketEvent {
  id: string; ticket_id: string; tenant_id: string; event_type: "created" | "comment" | "status" | "assign";
  message: string | null; from_status: string | null; to_status: string | null; attachments: Attachment[];
  author_name: string | null; is_lumatek: boolean; created_at: string;
}

const BUCKET = "support-attachments";
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Erreur inconnue";

export const uploadAttachments = async (tenantId: string, files: File[]): Promise<Attachment[]> => {
  const out: Attachment[] = [];
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name} : 10 Mo maximum`);
    const path = `${tenantId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f);
    if (error) throw error;
    out.push({ path, name: f.name, size: f.size });
  }
  return out;
};
export const openAttachment = async (a: Attachment) => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 600);
  if (error || !data) return toast.error("Impossible d'ouvrir la pièce jointe");
  window.open(data.signedUrl, "_blank", "noopener");
};

/** SLA : dépassé si pas de résolution avant l'échéance. */
export const slaBreached = (t: SupportTicket) =>
  !!t.sla_due_at && new Date(t.resolved_at ?? Date.now()) > new Date(t.sla_due_at);

export const useSupportTickets = (tenantId?: string | null) => {
  const qc = useQueryClient();
  const key = ["support-tickets", tenantId ?? "all"];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      let r = supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      if (tenantId) r = r.eq("tenant_id", tenantId);
      const { data, error } = await r;
      if (error) throw error;
      return (data || []) as unknown as SupportTicket[];
    },
  });
  const inv = () => { qc.invalidateQueries({ queryKey: ["support-tickets"] }); qc.invalidateQueries({ queryKey: ["support-events"] }); };

  const create = useMutation({
    mutationFn: async (t: Partial<SupportTicket>) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_tickets").insert({ ...t, created_by: u.user?.id } as never);
      if (error) throw error;
    },
    onSuccess: () => { inv(); toast.success("Ticket créé"); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<SupportTicket> & { id: string }) => {
      const { error } = await supabase.from("support_tickets").update(patch as never).eq("id", id);
      if (error) throw error;
      notifyTicket(id);
    },
    onSuccess: () => { inv(); toast.success("Ticket mis à jour"); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const comment = useMutation({
    mutationFn: async (e: { ticket: SupportTicket; message: string; attachments: Attachment[]; isLumatek: boolean; authorName?: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_ticket_events").insert({
        ticket_id: e.ticket.id, tenant_id: e.ticket.tenant_id, event_type: "comment", message: e.message,
        attachments: e.attachments, is_lumatek: e.isLumatek, author_id: u.user?.id, author_name: e.authorName ?? null,
      } as never);
      if (error) throw error;
      notifyTicket(e.ticket.id);
    },
    onSuccess: () => { inv(); toast.success("Message envoyé"); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return { tickets: q.data || [], isLoading: q.isLoading, create, update, comment };
};

export const useTicketEvents = (ticketId?: string) =>
  useQuery({
    queryKey: ["support-events", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("support_ticket_events").select("*")
        .eq("ticket_id", ticketId!).order("created_at");
      if (error) throw error;
      return (data || []) as unknown as TicketEvent[];
    },
  });

/** Liste des membres LUMATEK (super admins) pour l'assignation. */
export const useLumatekAgents = (enabled: boolean) =>
  useQuery({
    queryKey: ["lumatek-agents"],
    enabled,
    queryFn: async () => {
      const { data: admins } = await supabase.from("platform_admins").select("user_id");
      const ids = (admins || []).map((a) => a.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      return ids.map((id) => ({ id, name: profs?.find((p) => p.user_id === id)?.full_name || "Agent LUMATEK" }));
    },
  });

/** Envoie au client les emails en attente pour ce ticket (non bloquant). */
export const notifyTicket = (ticketId: string) => {
  supabase.functions.invoke("notify-ticket", { body: { ticket_id: ticketId } }).catch(() => undefined);
};
