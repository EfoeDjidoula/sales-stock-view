// Données simulées HSE & maintenance (mode démo) — cohérentes avec les stations, cuves et pompes démo.
const id = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export const buildHseMaintenance = (base: any, stations: any[], tanks: any[], pumps: any[], userId: string, validatorId: string) => {
  const ts = (offset: number) => `${day(offset)}T09:00:00.000Z`;
  // ---------- HSE ----------
  const hse_agents = [["Koffi Mensah", "Responsable HSE", "NEBOSH IGC", 210], ["Aïcha Bello", "Inspectrice sécurité", "SST", 25], ["Rodrigue Hounsou", "Chef de piste", "Équipier incendie", -10]]
    .map(([full_name, job_title, certification, exp], i) => ({ ...base, id: id("e1000000", i + 1), full_name, job_title, certification, certification_expires_on: day(exp as number), phone: `+229 97 00 00 0${i}`, email: `hse${i + 1}@demo.lumatek`, status: "active", user_id: null }));
  const checklists = [{ name: "Inspection sécurité piste", category: "securite", items: ["Extincteurs accessibles et plombés", "Bouton d'arrêt d'urgence fonctionnel", "Signalisation interdiction de fumer", "Absence de fuite aux distributeurs", "Kit anti-pollution complet"] },
    { name: "Environnement & cuves", category: "environnement", items: ["Séparateur d'hydrocarbures vidangé", "Évents de cuves dégagés", "Regards de dépotage propres", "Registre déchets à jour"] }];
  const hse_checklists: any[] = [], hse_checklist_items: any[] = [];
  checklists.forEach((c, ci) => {
    const cid = id("e2000000", ci + 1);
    hse_checklists.push({ ...base, id: cid, name: c.name, category: c.category, is_active: true });
    c.items.forEach((label, k) => hse_checklist_items.push({ ...base, id: id("e3000000", ci * 10 + k + 1), checklist_id: cid, label, position: k + 1, weight: k < 2 ? 2 : 1, is_critical: k < 2, is_active: true }));
  });
  const hse_inspections: any[] = [], hse_inspection_answers: any[] = [], hse_nonconformities: any[] = [], hse_history: any[] = [];
  const hist = (entity_type: string, entity_id: string, action: string, offset: number, comment: string | null = null) =>
    hse_history.push({ tenant_id: base.tenant_id, country_id: base.country_id, id: id("e9000000", hse_history.length + 1), entity_type, entity_id, action, actor_id: userId, comment, details: null, created_at: ts(offset) });
  stations.forEach((s, si) => [-24, -10, -2].forEach((off, k) => {
    const n = si * 3 + k + 1, iid = id("e4000000", n), cl = hse_checklists[k % 2];
    const items = hse_checklist_items.filter((x) => x.checklist_id === cl.id);
    const failIdx = (si + k) % 3 === 0 ? 2 : (si === 3 && k === 2 ? 0 : -1);
    items.forEach((it, j) => hse_inspection_answers.push({ ...base, id: id("e5000000", hse_inspection_answers.length + 1), inspection_id: iid, item_id: it.id, result: j === failIdx ? "nok" : "ok", comment: j === failIdx ? "Constat lors de l'inspection démo" : null }));
    const total = items.reduce((a, x) => a + x.weight, 0), ok = items.reduce((a, x, j) => a + (j === failIdx ? 0 : x.weight), 0);
    const status = k === 2 ? (si % 2 ? "draft" : "submitted") : "validated";
    hse_inspections.push({ ...base, id: iid, station_id: s.id, checklist_id: cl.id, inspected_on: day(off), inspector: hse_agents[k % 2].full_name, agent_id: hse_agents[k % 2].id, notes: null, score: Math.round((ok / total) * 100), status,
      created_by: userId, submitted_by: status !== "draft" ? userId : null, submitted_at: status !== "draft" ? ts(off) : null, validated_by: status === "validated" ? validatorId : null, validated_at: status === "validated" ? ts(off + 1) : null });
    hist("inspection", iid, "created", off);
    if (status === "validated") hist("inspection", iid, "validated", off + 1);
    if (failIdx >= 0) {
      const ncId = id("e6000000", hse_nonconformities.length + 1), it = items[failIdx];
      const ncStatus = off < -20 ? "closed" : off < -5 ? "in_progress" : "open";
      hse_nonconformities.push({ ...base, id: ncId, station_id: s.id, inspection_id: iid, item_id: it.id, event_id: null, title: it.label + " — non conforme", description: "Écart relevé pendant l'inspection.", severity: it.is_critical ? "major" : "minor", corrective_action: "Remise en conformité par l'équipe station", responsible: hse_agents[2].full_name, due_on: day(off + 14), status: ncStatus,
        created_by: userId, closure_proof: ncStatus === "closed" ? "Photo de remise en état" : null, closure_attachment: null, closure_submitted_by: ncStatus === "closed" ? userId : null, closure_submitted_at: ncStatus === "closed" ? ts(off + 5) : null, closed_by: ncStatus === "closed" ? validatorId : null, closed_at: ncStatus === "closed" ? ts(off + 6) : null });
      hist("nonconformity", ncId, "created", off);
      if (ncStatus === "closed") hist("nonconformity", ncId, "closed", off + 6, "Clôture validée");
    }
  }));
  const ev = [[0, "near_miss", "medium", "Débordement lors d'un remplissage de jerrican", 0, -18, "closed"], [2, "incident", "high", "Fuite au flexible du distributeur G1", 0, -7, "open"], [3, "accident", "low", "Glissade d'un pompiste sur la piste", 1, -4, "open"], [1, "fire_drill", "low", "Exercice d'évacuation incendie trimestriel", 0, -12, "closed"]] as const;
  const hse_events = ev.map(([si, kind, severity, title, injuries, off, status], i) => ({ ...base, id: id("e7000000", i + 1), station_id: stations[si].id, kind, severity, title, description: "Événement simulé pour la démonstration.", injuries, occurred_at: ts(off), immediate_actions: "Zone sécurisée, absorbant appliqué", responsible: hse_agents[0].full_name, agent_id: hse_agents[i % 3].id, status, created_by: userId }));
  hse_events.forEach((e, i) => hist("event", e.id, "created", ev[i][5]));
  const hse_safety_items: any[] = [];
  stations.forEach((s, si) => {
    const push = (kind: string, label: string, reference: string, quantity: number, last: number, next: number, expires: number | null, status = "ok") =>
      hse_safety_items.push({ ...base, id: id("e8000000", hse_safety_items.length + 1), station_id: s.id, kind, label, reference, quantity, last_check_on: day(last), next_check_on: day(next), expires_on: expires === null ? null : day(expires), status, notes: null });
    push("extinguisher", "Extincteur poudre ABC 9 kg", `EXT-${si + 1}01`, 4, -90, si === 1 ? -5 : 90, 400);
    push("extinguisher", "Extincteur CO2 6 kg", `EXT-${si + 1}02`, 2, -60, 120, si === 3 ? -15 : 300, si === 3 ? "to_replace" : "ok");
    push("spill_kit", "Kit anti-pollution 120 L", `KAP-${si + 1}`, 1, -30, 60, null);
    push("ppe", "Gants et lunettes pompistes", `EPI-${si + 1}`, 8, -20, 70, 200);
  });

  // ---------- Maintenance ----------
  const maintenance_assets: any[] = [];
  const asset = (s: any, category: string, model: string, manufacturer: string, loc: string, status = "active", installedYears = 4) =>
    maintenance_assets.push({ ...base, id: id("ea000000", maintenance_assets.length + 1), asset_number: `EQ-${String(maintenance_assets.length + 1).padStart(3, "0")}`, category, custom_category: null, location_type: "station", station_id: s.id, depot_id: null, location_detail: loc, model, manufacturer, serial_number: `SN-DEMO-${1000 + maintenance_assets.length}`, installed_on: day(-365 * installedYears), warranty_until: day(365 * (5 - installedYears)), status, notes: null, created_by: userId });
  stations.forEach((s, si) => {
    tanks.filter((t) => t.station_id === s.id).forEach((t) => asset(s, "tank", `${t.capacity_liters / 1000} m³ double paroi`, "Cuves Afrique", t.name, "active", 8));
    pumps.filter((p) => p.station_id === s.id).forEach((p) => asset(s, "pump", "Quantium 510", "Tokheim", `Distributeur ${p.name}`, si === 2 && p.name === "G1" ? "down" : si === 0 && p.name === "S2" ? "maintenance" : "active", 3));
    asset(s, "generator", "GE 60 kVA", "SDMO", "Local technique", "active", 5);
    asset(s, "tpe", "Move/5000", "Ingenico", "Caisse", "active", 2);
  });
  const maintenance_plans: any[] = [];
  maintenance_assets.filter((a) => ["pump", "generator"].includes(a.category)).forEach((a, i) => {
    const freq = a.category === "pump" ? 90 : 30, last = -((i * 11) % freq) - 3;
    maintenance_plans.push({ ...base, id: id("eb000000", i + 1), asset_id: a.id, title: a.category === "pump" ? "Étalonnage et contrôle distributeur" : "Vidange et révision groupe", frequency_days: freq, last_done_on: day(last), next_due_on: day(last + freq - (i % 5 === 0 ? freq + 4 : 0)), provider: a.category === "pump" ? "Tokheim Service Bénin" : "Énergie Services", is_active: true });
  });
  const maintenance_work_orders: any[] = [], maintenance_parts: any[] = [], maintenance_events: any[] = [];
  const wo = (a: any, kind: string, priority: string, status: string, open: number, desc: string, labour: number, downtime: number, parts: [string, number, number][], plan: any = null) => {
    const wid = id("ec000000", maintenance_work_orders.length + 1);
    const partsCost = parts.reduce((x, [, q, c]) => x + q * c, 0);
    maintenance_work_orders.push({ ...base, id: wid, number: `OT-2026-${String(maintenance_work_orders.length + 1).padStart(4, "0")}`, asset_id: a.id, plan_id: plan?.id ?? null, kind, priority, status, opened_at: ts(open), started_at: status !== "open" ? ts(open) : null, completed_at: status === "done" ? ts(open + 1) : null, failure_description: desc, technician: "Technicien démo", provider: plan?.provider ?? "Atelier interne", report: status === "done" ? "Intervention réalisée, équipement remis en service." : null, labour_cost: labour, parts_cost: partsCost, downtime_hours: downtime, created_by: userId });
    parts.forEach(([name, quantity, unit_cost]) => maintenance_parts.push({ ...base, id: id("ed000000", maintenance_parts.length + 1), work_order_id: wid, name, quantity, unit_cost }));
    [["work_order_opened", open], ...(status === "done" ? [["work_order_done", open + 1]] : [])].forEach(([event, off]) =>
      maintenance_events.push({ tenant_id: base.tenant_id, country_id: base.country_id, id: id("ee000000", maintenance_events.length + 1), asset_id: a.id, work_order_id: wid, event, actor_id: userId, details: null, created_at: ts(off as number) }));
  };
  const byLoc = (si: number, cat: string, k = 0) => maintenance_assets.filter((a) => a.station_id === stations[si].id && a.category === cat)[k];
  wo(byLoc(2, "pump", 2), "corrective", "critical", "in_progress", -2, "Fuite au flexible et compteur bloqué", 45000, 36, [["Flexible 3/4\" 4 m", 1, 85000], ["Joint torique", 4, 2500]]);
  wo(byLoc(0, "pump", 1), "corrective", "high", "open", -1, "Affichage prix défaillant", 0, 8, []);
  wo(byLoc(1, "generator"), "preventive", "normal", "done", -15, "Révision mensuelle", 30000, 2, [["Filtre à huile", 1, 12000], ["Huile 15W40 (L)", 12, 3500]], maintenance_plans.find((p) => p.asset_id === byLoc(1, "generator").id));
  wo(byLoc(3, "pump", 0), "preventive", "normal", "done", -25, "Étalonnage trimestriel", 50000, 4, [["Plombage métrologie", 2, 5000]], maintenance_plans.find((p) => p.asset_id === byLoc(3, "pump", 0).id));
  wo(byLoc(3, "tpe"), "corrective", "low", "done", -9, "TPE ne lit plus les cartes", 10000, 24, [["Lecteur de puce", 1, 40000]]);
  wo(byLoc(2, "generator"), "corrective", "high", "done", -20, "Démarreur en panne", 25000, 12, [["Démarreur 24 V", 1, 150000]]);

  return { hse_agents, hse_checklists, hse_checklist_items, hse_inspections, hse_inspection_answers, hse_nonconformities, hse_events, hse_safety_items, hse_history, hse_attachments: [],
    maintenance_assets, maintenance_plans, maintenance_work_orders, maintenance_parts, maintenance_events };
};
