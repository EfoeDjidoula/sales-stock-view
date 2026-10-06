DO $$
DECLARE
  t uuid := 'ec633b4a-e2c4-429c-ac88-b2daae5372a8'; c uuid := '75ff68df-5d76-4d04-8ab8-ffaf28a05daa';
  st uuid := 'ffb55cf7-cb7a-4814-a9e7-7d6c5177ec14'; pr uuid := '9ab00f86-4361-4547-a01e-d4592f20b369';
  adm uuid := '76bd6bfe-b005-41eb-bbc0-6a53e28ac757'; cl uuid; acc uuid; card uuid; inv uuid; r jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM clients WHERE name = 'ESSAI B2B — Transport Démo') THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  INSERT INTO clients(user_id, name, contact_name, phone, notes, tenant_id, country_id)
  VALUES (adm, 'ESSAI B2B — Transport Démo', 'Contact essai', '+229 00 00 00 00', 'Jeu d''essai B2B (données fictives)', t, c) RETURNING id INTO cl;
  PERFORM b2b_action('terms', t, c, cl, jsonb_build_object('contract_reference','ESSAI-B2B-001','reason','Jeu d''essai','credit_limit',1000000,'payment_days',30,
    'policy','auto_block','alert_levels',jsonb_build_array(70,80,90,100),'negotiated_prices',jsonb_build_object(pr::text,700),'site_ids',jsonb_build_array(st)));
  acc := (fuel_card_action('account', t, c, NULL, NULL, jsonb_build_object('client_id',cl,'kind','postpaid','limit',300000,'contract_reference','ESSAI-FC-001'))->>'id')::uuid;
  card := (fuel_card_action('card', t, c, acc, NULL, jsonb_build_object('number','ESSAI-0001','holder','Chauffeur essai','expires_on',(current_date+365)::text))->>'id')::uuid;
  PERFORM fuel_card_action('restrictions', t, c, acc, card, jsonb_build_object('restrictions', jsonb_build_object('start_hour',6,'end_hour',20,'max_transaction',50000)));
  PERFORM fuel_card_action('purchase', t, c, acc, card, jsonb_build_object('amount',35000,'litres',50,'station_id',st,'product_id',pr,'reference','ESSAI-FC-TX-001'));
  PERFORM b2b_action('consumption', t, c, cl, jsonb_build_object('station_id',st,'product_id',pr,'litres',1000,'unit_price',700,'reference','ESSAI-BL-001','consumed_on',current_date::text));
  r := b2b_action('invoice', t, c, cl, jsonb_build_object('period_start',(current_date-30)::text,'period_end',current_date::text));
  inv := (r->>'id')::uuid;
  PERFORM b2b_action('payment', t, c, cl, jsonb_build_object('invoice_id',inv,'amount',400000,'reference','ESSAI-VIR-001','paid_on',current_date::text));
  PERFORM reconcile_station_day(st, current_date);
  PERFORM run_fraud_scan(t, c, current_date - 1, current_date);
END $$;