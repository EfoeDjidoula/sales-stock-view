// Données simulées de la chaîne logistique : flotte, compartiments, chauffeurs, BC/BE, transports.
/* eslint-disable @typescript-eslint/no-explicit-any */
const id = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const buildLogistics = (base: any, stations: any[], products: any[], clients: any[], userId: string) => {
  const today = new Date();
  const day = (n: number) => iso(new Date(today.getTime() - n * 86400000));
  const ts = (n: number, h = 8) => new Date(today.getTime() - n * 86400000 + h * 3600000).toISOString();
  const [sup, gas] = products;

  const depots = [{ ...base, id: id("e1000000", 1), code: "SONACOP-COT", name: "Dépôt SONACOP Cotonou", location: "Port de Cotonou", capacity_liters: 5000000, status: "active", notes: null, equipment_type_id: null }];
  const suppliers = [{ ...base, id: id("e1100000", 1), user_id: userId, name: "SONACOP SA", contact_name: "Service commercial", phone: "+229 21 00 00 00", email: "ventes@sonacop.demo", address: "Cotonou", tax_id: "IFU-SUP", product_type: null, notes: null, is_active: true }];
  const carriers = [
    { ...base, id: id("e1200000", 1), name: "Transports Démo Énergie (interne)", code: "INT", phone: "+229 01 11 11 11", email: null, address: "Cotonou", is_internal: true, status: "active" },
    { ...base, id: id("e1200000", 2), name: "Bénin Citernes SARL", code: "BCS", phone: "+229 01 22 22 22", email: "contact@bcs.demo", address: "Porto-Novo", is_internal: false, status: "active" },
  ];
  const drivers = ["Koffi AHOUANSOU", "Rodrigue DOSSOU", "Ibrahim SALIFOU", "Fabrice HOUNKPÈ"].map((full_name, i) => ({
    ...base, id: id("e1300000", i + 1), carrier_id: carriers[i % 2].id, full_name, license_number: `PL-BJ-${2019 + i}-${1040 + i}`, phone: `+229 97 00 00 0${i}`, status: "active" }));

  // Flotte : 2 porteurs + 2 tracteurs attelés à leur semi-remorque / remorque citerne
  const v = (n: number, o: any) => ({ ...base, id: id("e1400000", n), brand: null, model: null, vin: null, gps_device_id: null, status: "active", notes: null, legacy_truck_id: null, default_driver_id: null, default_trailer_id: null, ...o });
  const trailer1 = v(3, { kind: "semi_trailer", registration: "BJ 7781 RB-SR", carrier_id: carriers[0].id, capacity_litres: 40000, brand: "Trailor" });
  const trailer2 = v(4, { kind: "trailer", registration: "BJ 5520 RB-R", carrier_id: carriers[1].id, capacity_litres: 33000, brand: "Magyar" });
  const vehicles = [
    v(1, { kind: "truck", registration: "BJ 4401 RB", carrier_id: carriers[0].id, capacity_litres: 20000, brand: "Renault", model: "Kerax", default_driver_id: drivers[0].id }),
    v(2, { kind: "truck", registration: "BJ 4402 RB", carrier_id: carriers[1].id, capacity_litres: 18000, brand: "Mercedes", model: "Actros", default_driver_id: drivers[1].id }),
    trailer1, trailer2,
    v(5, { kind: "tractor", registration: "BJ 7781 RB", carrier_id: carriers[0].id, capacity_litres: null, brand: "Volvo", model: "FH", default_driver_id: drivers[2].id, default_trailer_id: trailer1.id }),
    v(6, { kind: "tractor", registration: "BJ 5520 RB", carrier_id: carriers[1].id, capacity_litres: null, brand: "MAN", model: "TGS", default_driver_id: drivers[3].id, default_trailer_id: trailer2.id }),
  ];
  const plans: [string, number[]][] = [[vehicles[0].id, [10000, 10000]], [vehicles[1].id, [6000, 6000, 6000]], [trailer1.id, [10000, 10000, 10000, 10000]], [trailer2.id, [11000, 11000, 11000]]];
  let cn = 0;
  const compartments = plans.flatMap(([vid, caps]) => caps.map((c, i) => ({ tenant_id: base.tenant_id, country_id: base.country_id, created_at: base.created_at, id: id("e1500000", ++cn), vehicle_id: vid, position: i + 1, capacity_litres: c, calibration_ref: `BAR-${cn}` })));
  const exp = iso(new Date(today.getTime() + 200 * 86400000));
  let dn = 0;
  const logistics_documents = [
    ...vehicles.flatMap((x) => ["Assurance", "Carte grise", "Visite technique"].map((doc_type) => ({ ...base, id: id("e1600000", ++dn), entity_type: "vehicle", vehicle_id: x.id, driver_id: null, doc_type, doc_number: `DOC-${dn}`, issued_on: day(160), expires_on: exp, file_path: null }))),
    ...drivers.map((x) => ({ ...base, id: id("e1600000", ++dn), entity_type: "driver", vehicle_id: null, driver_id: x.id, doc_type: "Permis poids lourd", doc_number: x.license_number, issued_on: day(900), expires_on: exp, file_path: null })),
  ];

  // Pro-forma → BC payé → BE signés / brouillon
  const price = { [sup.id]: 610, [gas.id]: 640 };
  const pfLines = [[sup.id, 120000], [gas.id, 150000]].map(([pid, q], i) => {
    const ht = (q as number) * price[pid as string];
    return { ...base, id: id("e1700000", i + 1), proforma_id: id("e1800000", 1), product_id: pid, qty_litres: q, unit_price: price[pid as string], tax_rate: 0, amount_ht: ht, tax_amount: 0, amount_ttc: ht, qty_lifted: 0 };
  });
  const total = pfLines.reduce((s, l) => s + l.amount_ttc, 0);
  const depot_proformas = [{ ...base, id: id("e1800000", 1), supplier_id: suppliers[0].id, depot_id: depots[0].id, number: "PF-DEMO-0001", proforma_date: day(12), valid_until: day(-18), observations: "Pro-forma simulée", total_ht: total, total_tax: 0, total_ttc: total, created_by: userId }];
  const depot_purchase_orders = [{ ...base, id: id("e1900000", 1), proforma_id: depot_proformas[0].id, number: "BC-DEMO-0001", issue_date: day(11), beneficiary_client_id: null, beneficiary_name: "DÉMO ÉNERGIE", payment_status: "paiement_direct", status_by: userId, status_by_name: "Démo — Directeur Général", status_at: ts(11), created_by: userId }];

  const trips: any[] = [], loads: any[] = [], liftings: any[] = [], lines: any[] = [], deliveries: any[] = [];
  const be = (n: number, veh: any, drv: any, status: string, ago: number, dest: number, prod: any, tripStatus: string) => {
    const unit = veh.default_trailer_id ? vehicles.find((x) => x.id === veh.default_trailer_id) : veh;
    const cs = compartments.filter((c) => c.vehicle_id === unit.id);
    const qty = cs.reduce((s, c) => s + c.capacity_litres, 0);
    const tid = id("e2000000", n);
    const done = tripStatus === "delivered";
    trips.push({ ...base, id: tid, reference: `TR-DEMO-${String(n).padStart(4, "0")}`, supply_request_id: null, carrier_id: veh.carrier_id, truck_id: veh.id, tanker_id: veh.default_trailer_id, driver_id: drv.id, status: tripStatus,
      planned_departure: ts(ago, 7), eta: ts(ago, 14), loading_started_at: status === "signed" ? ts(ago, 6) : null, loaded_at: status === "signed" ? ts(ago, 7) : null, departed_at: ["in_transit", "delivered"].includes(tripStatus) ? ts(ago, 8) : null,
      arrived_at: done ? ts(ago, 13) : null, unloading_started_at: done ? ts(ago, 13) : null, delivered_at: done ? ts(ago, 14) : null,
      qty_loaded: status === "signed" ? qty : null, qty_delivered: done ? qty - 35 : null, tolerance_pct: 0.5, incident_note: null, last_position: null, created_by: userId, load_mode: "mono" });
    cs.forEach((c, i) => {
      const lid = id("e2100000", n * 10 + i);
      loads.push({ ...base, id: lid, trip_id: tid, compartment_id: c.id, product_id: prod.id, qty_litres: c.capacity_litres, destination_type: "station", station_id: stations[dest].id, client_id: null, stop_order: 1 });
      if (done) deliveries.push({ ...base, id: id("e2200000", n * 10 + i), trip_id: tid, load_id: lid, qty_litres: c.capacity_litres - (i === 0 ? 35 : 0), confirmed_by: userId, confirmed_at: ts(ago, 14), note: null });
    });
    liftings.push({ ...base, id: id("e2300000", n), number: `BE-DEMO-${String(n).padStart(4, "0")}`, order_id: depot_purchase_orders[0].id, depot_id: depots[0].id, trip_id: tid, vehicle_id: veh.id, tanker_id: veh.default_trailer_id, driver_id: drv.id, load_mode: "mono", planned_date: day(ago), total_litres: qty, status,
      observations: null, signature_png: null, signed_by: status === "signed" ? userId : null, signed_by_name: status === "signed" ? "Démo — Superviseur Logistique" : null, signed_role: status === "signed" ? "Chef de dépôt" : null, signed_at: status === "signed" ? ts(ago, 7) : null, cancel_reason: null, cancelled_by: null, cancelled_at: null, created_by: userId });
    lines.push({ ...base, id: id("e2400000", n), lifting_id: id("e2300000", n), proforma_line_id: pfLines[prod === sup ? 0 : 1].id, product_id: prod.id, qty_litres: qty });
    if (status === "signed") pfLines[prod === sup ? 0 : 1].qty_lifted += qty;
  };
  be(1, vehicles[4], drivers[2], "signed", 6, 0, gas, "delivered");
  be(2, vehicles[0], drivers[0], "signed", 3, 2, sup, "delivered");
  be(3, vehicles[5], drivers[3], "signed", 0, 3, gas, "in_transit");
  be(4, vehicles[1], drivers[1], "established", -1, 1, sup, "planned");

  return {
    depots, suppliers, logistics_carriers: carriers, logistics_drivers: drivers, logistics_vehicles: vehicles, logistics_compartments: compartments, logistics_documents,
    logistics_seals: [], logistics_alerts: [], logistics_gps_positions: [], logistics_trip_events: [],
    depot_proformas, depot_proforma_lines: pfLines, depot_purchase_orders, depot_purchase_order_events: [],
    depot_lifting_orders: liftings, depot_lifting_lines: lines, depot_lifting_events: [],
    logistics_trips: trips, logistics_trip_loads: loads, logistics_load_deliveries: deliveries,
  };
};
