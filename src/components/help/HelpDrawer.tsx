import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, HelpCircle, List, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { HELP_FOR_SCREEN, MANUAL, openHelp } from "@/lib/help/manual";

/** Volet d'aide unique, ouvert via openHelp(section?) depuis n'importe quel écran. */
export function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: Event) => { const s = (e as CustomEvent).detail as string | undefined; setCurrent(s ? HELP_FOR_SCREEN[s] ?? s : null); setQ(""); setOpen(true); };
    window.addEventListener("open-help", h); return () => window.removeEventListener("open-help", h);
  }, []);
  useEffect(() => { top.current?.scrollTo({ top: 0 }); }, [current]);
  const idx = MANUAL.findIndex((s) => s.id === current), section = MANUAL[idx];
  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return MANUAL;
    return MANUAL.filter((s) => [s.title, s.summary, ...s.blocks.flatMap((b) => [b.heading, ...b.points])].join(" ").toLowerCase().includes(t));
  }, [q]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} className="z-[70] flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <div className="shrink-0 space-y-3 border-b p-4 pr-12 pt-[max(1rem,env(safe-area-inset-top))]">
          <SheetHeader className="text-left"><SheetTitle className="flex items-center gap-2 text-base"><BookOpen className="w-5 h-5 text-primary" />Manuel de formation</SheetTitle></SheetHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setCurrent(null); }} placeholder="Rechercher…" className="h-10 pl-9" />
            </div>
            <Select value={current ?? ""} onValueChange={(v) => { setQ(""); setCurrent(v); }}>
              <SelectTrigger className="h-10 w-auto gap-1.5" aria-label="Aller au chapitre"><List className="w-4 h-4" /><span className="hidden sm:inline">Chapitres</span></SelectTrigger>
              <SelectContent className="z-[80] max-w-[90vw]">{MANUAL.map((s) => <SelectItem key={s.id} value={s.id}>{s.number}. {s.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div ref={top} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {section ? (
          <article className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setCurrent(null)} className="-ml-2 h-9"><ChevronLeft className="w-4 h-4" />Sommaire</Button>
            <div><p className="text-xs uppercase tracking-wide text-primary">Section {section.number}</p><h2 className="text-lg font-semibold leading-snug">{section.title}</h2><p className="text-sm text-muted-foreground">{section.summary}</p></div>
            {section.blocks.map((b) => (
              <div key={b.heading} className="rounded-lg border bg-card/50 p-3">
                <h3 className="font-medium mb-2">{b.heading}</h3>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">{b.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ))}
          </article>
        ) : (
          <nav className="space-y-2">
            {results.length === 0 && <p className="text-sm text-muted-foreground">Aucun résultat.</p>}
            {results.map((s) => (
              <button key={s.id} onClick={() => setCurrent(s.id)} className="w-full text-left rounded-lg border p-3 hover:bg-secondary active:bg-secondary transition-colors">
                <span className="text-xs text-primary">Section {s.number}</span>
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-muted-foreground">{s.summary}</div>
              </button>
            ))}
          </nav>
        )}
        </div>
        {section && (
          <div className="flex shrink-0 items-center gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="h-11 flex-1" disabled={idx <= 0} onClick={() => setCurrent(MANUAL[idx - 1].id)}><ChevronLeft className="w-4 h-4" />Précédent</Button>
            <span className="text-xs text-muted-foreground tabular-nums">{idx + 1}/{MANUAL.length}</span>
            <Button variant="outline" className="h-11 flex-1" disabled={idx >= MANUAL.length - 1} onClick={() => setCurrent(MANUAL[idx + 1].id)}>Suivant<ChevronRight className="w-4 h-4" /></Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Bouton discret « Guide du module » pour un écran donné. */
export function HelpButton({ screen, label = "Guide du module" }: { screen?: string; label?: string }) {
  const Icon = screen ? HelpCircle : BookOpen;
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" title={label} aria-label={label} onClick={() => openHelp(screen)}>
      <Icon className="w-4 h-4" /><span className="hidden lg:inline">{label}</span>
    </Button>
  );
}
