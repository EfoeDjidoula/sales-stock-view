import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, HelpCircle, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useEffect(() => { top.current?.scrollIntoView(); }, [current]);
  const idx = MANUAL.findIndex((s) => s.id === current), section = MANUAL[idx];
  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return MANUAL;
    return MANUAL.filter((s) => [s.title, s.summary, ...s.blocks.flatMap((b) => [b.heading, ...b.points])].join(" ").toLowerCase().includes(t));
  }, [q]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto pt-14">
        <div ref={top} />
        <SheetHeader><SheetTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Manuel de formation</SheetTitle></SheetHeader>
        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setCurrent(null); }} placeholder="Rechercher dans le manuel…" className="pl-9" />
        </div>
        {section ? (
          <article className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setCurrent(null)} className="-ml-2"><ChevronLeft className="w-4 h-4" />Sommaire</Button>
            <div><p className="text-xs uppercase tracking-wide text-primary">Section {section.number}</p><h2 className="text-lg font-semibold">{section.title}</h2><p className="text-sm text-muted-foreground">{section.summary}</p></div>
            {section.blocks.map((b) => (
              <div key={b.heading} className="rounded-lg border bg-card/50 p-3">
                <h3 className="font-medium mb-2">{b.heading}</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">{b.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <Button variant="outline" size="sm" disabled={idx <= 0} onClick={() => setCurrent(MANUAL[idx - 1].id)}><ChevronLeft className="w-4 h-4" />Précédent</Button>
              <Button variant="outline" size="sm" disabled={idx >= MANUAL.length - 1} onClick={() => setCurrent(MANUAL[idx + 1].id)}>Suivant<ChevronRight className="w-4 h-4" /></Button>
            </div>
          </article>
        ) : (
          <nav className="space-y-2">
            {results.length === 0 && <p className="text-sm text-muted-foreground">Aucun résultat.</p>}
            {results.map((s) => (
              <button key={s.id} onClick={() => setCurrent(s.id)} className="w-full text-left rounded-lg border p-3 hover:bg-secondary transition-colors">
                <span className="text-xs text-primary">Section {s.number}</span>
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-muted-foreground">{s.summary}</div>
              </button>
            ))}
          </nav>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Bouton discret « Guide du module » pour un écran donné. */
export function HelpButton({ screen, label = "Guide du module" }: { screen?: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" title={label} onClick={() => openHelp(screen)}>
      <HelpCircle className="w-4 h-4" /><span className="hidden lg:inline">{label}</span>
    </Button>
  );
}
