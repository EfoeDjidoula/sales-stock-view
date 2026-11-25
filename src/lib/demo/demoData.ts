/** Jeu de données simulé du mode démo (aucune donnée réelle). */
export type DemoRole = "admin" | "operator" | "manager";

export const DEMO_PROFILES: Record<DemoRole, { label: string; name: string; email: string; userId: string }> = {
  admin: { label: "Directeur Général / Contrôleur", name: "Démo — Directeur Général", email: "dg@demo.lumatek", userId: "d0000000-0000-4000-8000-000000000001" },
  operator: { label: "Gérant de Station", name: "Démo — Gérant Akassato", email: "gerant@demo.lumatek", userId: "d0000000-0000-4000-8000-000000000002" },
  manager: { label: "Superviseur Logistique & B2B", name: "Démo — Superviseur Logistique", email: "logistique@demo.lumatek", userId: "d0000000-0000-4000-8000-000000000003" },
};

export const MODULE_KEYS = "dashboard,stations,depots,stocks,ventes,livraisons,achats,commandes,clients_b2b,cartes_carburant,plafonds,fidelite,tickets_valeur,cuves,pompes,pistolets,index,jaugeage,calibration,controle,anti_fraude,maintenance,perequation,facturation,reporting,ia,audit,command_center,bi,cloture,moteur_stock,reconciliation,logistique,hse,workflows,support,api_hub,integrations,proforma,exercices,etats_synthese".split(",");
const CORE = new Set(["dashboard", "stations", "stocks", "ventes", "index", "support"]);

const PERM_AREAS = "dashboard,index_entries,stock,depotages,orders,supplies,clients,suppliers,trucks,stations,perequation,price_structures,proforma,fiscal_years,users,settings,reports".split(",");
const ACTIONS = ["view", "create", "edit", "validate", "delete", "export", "administer"];
const EXTRA = "sales.create,sales.validate,sales.export,sales.edit,sales.view,reconciliation.edit,reconciliation.create,reconciliation.validate,reconciliation.export,reconciliation.view,fraud.edit,fraud.view,fraud.validate,fraud.create,fuel_cards.view,fuel_cards.create,fuel_cards.edit,fuel_cards.validate,hse.manage,integrations.manage,workflows.view,workflows.manage,synthesis.view,synthesis.export,synthesis.validate,synthesis.administer".split(",");
const ALL_PERMS = [...PERM_AREAS.flatMap((a) => ACTIONS.map((x) => `${a}.${x}`)), ...EXTRA];

export const permissionsFor = (role: DemoRole): string[] => {
  if (role === "admin") return ALL_PERMS;
  if (role === "operator")
    return ["dashboard.view", "index_entries.view", "index_entries.create", "index_entries.edit", "stock.view", "depotages.view", "depotages.create", "supplies.validate", "sales.view", "sales.create", "stations.view", "reports.view"];
  return ALL_PERMS.filter((p) =>
    /^(dashboard|stock|depotages|orders|supplies|clients|trucks|suppliers|proforma)\./.test(p) ||
    ["sales.view", "reports.view", "reports.export", "index_entries.view", "index_entries.validate", "fuel_cards.view", "reconciliation.view", "stations.view"].includes(p));
};

export const modulesFor = (role: DemoRole): string[] => {
  if (role === "admin") return MODULE_KEYS;
  if (role === "operator") return ["dashboard", "stations", "stocks", "ventes", "index", "cloture", "jaugeage", "depots", "support"];
  return ["dashboard", "stations", "stocks", "ventes", "index", "depots", "livraisons", "achats", "commandes", "clients_b2b", "cartes_carburant", "facturation", "logistique", "proforma", "cuves", "support", "reconciliation"];
};

export const TENANT = "d1000000-0000-4000-8000-000000000001";
export const COUNTRY = "d2000000-0000-4000-8000-000000000001";
const PRICE = { super: 695, gasoil: 720 };

const id = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const e30 = () => iso(new Date(Date.now() + 30 * 86400000));
// Pseudo-aléatoire déterministe : chiffres stables d'un rechargement à l'autre
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

import { buildHseMaintenance } from "./demoHseMaintenance";
import { buildLogistics } from "./demoLogistics";

export const buildDemoDb = (role: DemoRole) => {
  seed = 42;
  const now = new Date().toISOString();
  const base = { tenant_id: TENANT, country_id: COUNTRY, created_at: now, updated_at: now };
  const prof = DEMO_PROFILES[role];
  const names: [string, string][] = [["AKASSATO", "Abomey-Calavi"], ["ALLADA", "Allada"], ["COTONOU CENTRE", "Cotonou"], ["PARAKOU", "Parakou"]];
  const stations = names.map(([name, location], i) => ({ ...base, id: id("d3000000", i + 1), name, location, status: "active", zone_id: null, depot_id: null }));
  const products = (["super", "gasoil"] as const).map((code, i) => ({ ...base, id: id("d4000000", i + 1), code, name: code === "super" ? "Super" : "Gasoil", category: "carburant", color: code === "super" ? "#22c55e" : "#f59e0b", status: "active", position: i + 1, density: null, unit_id: null }));
  const tanks: any[] = [], pumps: any[] = [], nozzles: any[] = [];
  stations.forEach((s, si) => (["super", "gasoil"] as const).forEach((pt, pi) => {
    const t = { ...base, id: id("d5000000", si * 10 + pi + 1), station_id: s.id, name: `Cuve ${pt === "super" ? "Super" : "Gasoil"} 1`, product_type: pt, capacity_liters: pt === "super" ? 30000 : 40000, status: "active", product_id: products[pi].id, min_threshold: 5000, critical_threshold: 2500, notes: null, equipment_type_id: null, unit_id: null };
    tanks.push(t);
    for (let k = 1; k <= 2; k++) {
      const p = { ...base, id: id("d6000000", si * 10 + pi * 2 + k), station_id: s.id, tank_id: t.id, name: `${pt === "super" ? "S" : "G"}${k}`, product_type: pt, position: pi * 2 + k, status: "active", product_id: t.product_id, equipment_type_id: null };
      pumps.push(p);
      nozzles.push({ ...base, id: id("d7000000", si * 10 + pi * 2 + k), station_id: s.id, pump_id: p.id, tank_id: t.id, product_id: t.product_id, number: k, name: p.name, status: "active", notes: null, equipment_type_id: null });
    }
  }));

  const entries: any[] = [], pumpEntries: any[] = [], readings: any[] = [], closures: any[] = [], sales: any[] = [], depotages: any[] = [];
  const idx: Record<string, number> = {}; pumps.forEach((p, i) => (idx[p.id] = 100000 + i * 13000));
  const stock: Record<string, number> = {}; tanks.forEach((t) => (stock[t.id] = t.capacity_liters * 0.7));
  const today = new Date(); let n = 0;
  for (let d = 30; d >= 0; d--) {
    const date = iso(new Date(today.getTime() - d * 86400000));
    stations.forEach((s, si) => {
      n++;
      const eid = id("d8000000", n), cid = id("d9000000", n);
      const ok = !(d === 0 && si === 3);
      const e: any = { ...base, id: eid, station_id: s.id, entry_date: date, user_id: prof.userId, status: ok ? "valide" : "pre_enregistre", validated_by: null, validated_by_name: ok ? "Démo — Contrôleur" : null, validated_at: ok ? now : null, closure_id: ok ? cid : null };
      let tot = { super: 0, gasoil: 0 };
      pumps.filter((p) => p.station_id === s.id).forEach((p) => {
        const liters = Math.round((si === 2 ? 1400 : 800) + rnd() * 700);
        const dep = idx[p.id], arr = dep + liters; idx[p.id] = arr;
        tot[p.product_type as "super" | "gasoil"] += liters;
        const key = `${p.product_type}${p.name.slice(1)}`;
        e[`${key}_index_depart`] = dep; e[`${key}_index_arrivee`] = arr;
        pumpEntries.push({ ...base, id: id("da000000", pumpEntries.length + 1), entry_id: eid, pump_id: p.id, tank_id: p.tank_id, station_id: s.id, user_id: prof.userId, entry_date: date, product_type: p.product_type, index_depart: dep, index_arrivee: arr, liters_sold: liters, retour_cuve: 0, liters_net: liters });
        sales.push({ ...base, id: id("db000000", sales.length + 1), closure_id: cid, nozzle_id: nozzles.find((z) => z.pump_id === p.id)!.id, pump_id: p.id, tank_id: p.tank_id, product_id: p.product_id, index_start: dep, index_end: arr, volume: liters, volume_mode: "index", unit_price: PRICE[p.product_type as "super"], amount: liters * PRICE[p.product_type as "super"] });
      });
      tanks.filter((t) => t.station_id === s.id).forEach((t) => {
        const open = stock[t.id], out = tot[t.product_type as "super"];
        let dep = 0;
        if (open - out < t.capacity_liters * 0.3) {
          dep = 18000;
          depotages.push({ ...base, id: id("dc000000", depotages.length + 1), user_id: prof.userId, station_id: s.id, tank_id: t.id, product_type: t.product_type, truck_registration: `BJ ${4000 + depotages.length} RB`, truck_nominal_capacity: 18000, tank_capacity_liters: t.capacity_liters, quantity_to_unload: 18000, quantity_unloaded: 17960, tolerance_rate: 0.5, ecart: -40, depotage_date: date, notes: "Livraison simulée", truck_id: null, vehicle_id: null, stock_before: open, gauge_after: open + 17960, start_time: "08:00", end_time: "09:10", stock_theoretical: open + 18000, depotage_ecart: -40 });
        }
        const close = open + dep - out, jauge = Math.round(close - rnd() * 30);
        stock[t.id] = jauge;
        e[`${t.product_type}1_jauge`] = jauge; e[`${t.product_type}2_jauge`] = 0;
        readings.push({ ...base, id: id("dd000000", readings.length + 1), entry_id: eid, tank_id: t.id, station_id: s.id, user_id: prof.userId, entry_date: date, product_type: t.product_type, stock_ouverture: open, depotage: dep, depotage_reception: dep ? 17960 : 0, depotage_refs: dep ? "BL simulé" : null, sortie: out, stock_cloture: close, jauge, ecart: jauge - close });
      });
      const vente = tot.super * PRICE.super + tot.gasoil * PRICE.gasoil;
      const bons = Math.round(vente * 0.06), momo = Math.round(vente * 0.18), cartes = Math.round(vente * 0.04);
      Object.assign(e, { total_super_liters: tot.super, total_gasoil_liters: tot.gasoil, vente_globale: vente, bons_clients_montant: bons, tickets_valeur_montant: 0, cartes_montant: cartes, autoconso_montant: 0, versement_momo: momo, montant_a_verser: vente - bons - momo - cartes, versement_banque: vente - bons - momo - cartes, ecart_versement: 0, banque_nom: "Banque démo", total_versements: vente - bons - cartes, total_bons: bons, bons_carburant_nombre: 0, bons_carburant_valeur: 0, bons_entreprise_nombre: 0, bons_entreprise_valeur: 0, versement_liquidite: 0, sync_warnings: null });
      entries.push(e);
      if (ok) closures.push({ ...base, id: cid, station_id: s.id, closure_date: date, status: "validated", total_volume: tot.super + tot.gasoil, total_amount: vente, total_collected: vente, cash_variance: 0, notes: null, created_by: prof.userId, submitted_by: prof.userId, submitted_at: now, validated_by: DEMO_PROFILES.admin.userId, validated_at: now, source: "index", index_entry_id: eid });
    });
  }

  const stock_levels = tanks.map((t) => ({ tenant_id: TENANT, country_id: COUNTRY, tank_id: t.id, station_id: t.station_id, product_id: t.product_id, location_type: "station", theoretical: stock[t.id] + 20, physical: stock[t.id], variance: -20, alert_level: stock[t.id] < t.critical_threshold ? "critical" : stock[t.id] < t.min_threshold ? "warning" : "ok", capacity: t.capacity_liters }));
  const payment_methods = [["cash", "Espèces"], ["momo", "Mobile Money"], ["card", "Cartes"], ["voucher", "Bons clients"]].map(([code, name], i) => ({ ...base, id: id("df010000", i + 1), code, name, kind: code, is_active: true }));
  const closure_payments = closures.flatMap((c, i) => [0.72, 0.18, 0.04, 0.06].map((r, k) => ({ ...base, id: id("df020000", i * 4 + k + 1), closure_id: c.id, payment_method_id: payment_methods[k].id, amount: Math.round(c.total_amount * r), reference: null })));
  const clients = ["SOBEBRA Transport", "Société des Bus Urbains", "BTP Bénin Construction", "Agro Parakou SA"].map((name, i) => ({ ...base, id: id("de000000", i + 1), user_id: prof.userId, name, contact_name: "Contact démo", phone: "+229 01 00 00 00", email: `client${i + 1}@demo.lumatek`, address: "Cotonou", tax_id: `IFU-DEMO-${i + 1}`, notes: null, is_active: true }));
  const b2b_consumptions = entries.flatMap((e, i) => i % 2 ? [] : [{ ...base, id: id("df030000", i + 1), client_id: clients[i % 4].id, station_id: e.station_id, product_id: products[i % 2].id, consumed_on: e.entry_date, litres: 300 + (i % 5) * 80, amount: (300 + (i % 5) * 80) * (i % 2 ? PRICE.gasoil : PRICE.super) }]);
  const b2b_invoices = clients.map((c, i) => ({ ...base, id: id("df040000", i + 1), client_id: c.id, number: `FAC-DEMO-${i + 1}`, amount: b2b_consumptions.filter((x) => x.client_id === c.id).reduce((a, x) => a + x.amount, 0), due_on: e30(), status: "issued" }));
  const b2b_payments = b2b_invoices.map((f, i) => ({ ...base, id: id("df050000", i + 1), invoice_id: f.id, amount: Math.round(f.amount * 0.6), paid_on: iso(today) }));
  const country = { id: COUNTRY, code: "BJ", iso_code: "BJ", name: "Bénin", flag: "🇧🇯", currency_code: "XOF", currency_symbol: "FCFA", currency_decimals: 0, default_currency: "XOF", vat_rate: 18, locale: "fr-BJ", date_format: "dd/MM/yyyy", timezone: "Africa/Porto-Novo", default_language: "fr", fuel_products: null, is_active: true, created_at: now, updated_at: now };
  const planId = id("df000000", 1);

  return {
    tenants: [{ id: TENANT, slug: "demo", code: "DEMO", name: "DÉMO ÉNERGIE", legal_name: "DÉMO ÉNERGIE SA (données simulées)", trade_name: "Démo Énergie", status: "active", plan: "enterprise", default_currency: "XOF", default_language: "fr", show_powered_by: true, powered_by_label: "Powered by LUMATEK", app_title: "Mode démo", primary_color: null, secondary_color: null, logo_url: null, favicon_url: null, address: "Cotonou, Bénin", phone: "+229 00 00 00 00", email: "contact@demo.lumatek", website: null, tax_id: "IFU-DEMO", bank_details: "Banque démo — compte fictif", footer_note: "Document de démonstration — données simulées", created_at: now, updated_at: now }],
    countries: [country],
    tenant_countries: [{ ...base, id: id("df100000", 1), is_default: true, is_active: true, status: "active", currency: "XOF", timezone: country.timezone, language: "fr", configuration: {}, legal_name: "DÉMO ÉNERGIE BÉNIN SA", address: "Cotonou", phone: "+229 00 00 00 00", email: "contact@demo.lumatek", tax_id: "IFU-DEMO", bank_details: "Banque démo — compte fictif" }],
    profiles: Object.values(DEMO_PROFILES).map((p) => ({ ...base, id: p.userId, user_id: p.userId, full_name: p.name, is_active: true })),
    user_roles: (Object.keys(DEMO_PROFILES) as DemoRole[]).map((r, i) => ({ id: id("df200000", i + 1), user_id: DEMO_PROFILES[r].userId, role: r, created_at: now })),
    user_country_access: [{ id: id("df300000", 1), user_id: prof.userId, tenant_id: TENANT, country_id: COUNTRY, created_at: now }],
    station_assignments: role === "operator" ? [{ id: id("df400000", 1), user_id: prof.userId, station_id: stations[0].id, created_at: now }] : [],
    modules: MODULE_KEYS.map((key, i) => ({ id: id("df500000", i + 1), key, label: key, description: null, category: "demo", is_core: CORE.has(key), position: i * 10, created_at: now, updated_at: now })),
    tenant_modules: modulesFor(role).map((k, i) => ({ id: id("df600000", i + 1), tenant_id: TENANT, module_key: k, is_enabled: true })),
    country_modules: [],
    licenses: [{ id: id("df700000", 1), license_number: "DEMO-0001", tenant_id: TENANT, plan_id: planId, status: "active", activation_date: "2026-01-01", start_date: "2026-01-01", expiration_date: "2099-12-31", grace_period_days: 30, max_users: 100, max_countries: 10, max_stations: 100, automatic_renewal: true, expiry_policy: "read_only", notes: null, created_at: now, updated_at: now }],
    license_plans: [{ id: planId, name: "Enterprise (démo)", code: "enterprise" }],
    license_modules: MODULE_KEYS.map((k, i) => ({ id: id("df800000", i + 1), plan_id: planId, module_key: k })),
    price_structures: [{ ...base, id: id("df900000", 1), country: "BJ", effective_date: "2026-01-01", label: "Structure démo", super_price: PRICE.super, gasoil_price: PRICE.gasoil, elements: [], is_active: true, user_id: prof.userId }],
    stations, petroleum_products: products, tanks, pumps, nozzles,
    index_entries: entries, pump_index_entries: pumpEntries, index_tank_readings: readings,
    daily_closures: closures, closure_sales: sales, closure_payments, payment_methods, stock_levels, depotages, clients, b2b_consumptions, b2b_invoices, b2b_payments,
    b2b_portal_users: [], platform_admins: [],
    ...buildLogistics(base, stations, products, clients, prof.userId),
    ...buildHseMaintenance(base, stations, tanks, pumps, prof.userId, DEMO_PROFILES.admin.userId),
  } as Record<string, any[]>;
};
