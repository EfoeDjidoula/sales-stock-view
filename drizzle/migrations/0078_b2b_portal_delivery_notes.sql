CREATE OR REPLACE FUNCTION public.b2b_portal_delivery_notes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.b2b_portal_users;
BEGIN
  m := public.b2b_portal_me();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', n.id, 'number', n.number, 'trip_id', n.trip_id, 'tenant_id', n.tenant_id, 'country_id', n.country_id, 'created_at', n.created_at,
    'trip_status', t.status, 'shipper_user', n.shipper_user, 'carrier_user', n.carrier_user, 'consignee_user', n.consignee_user,
    'snapshot', n.snapshot,
    'signatures', coalesce((SELECT jsonb_agg(jsonb_build_object('role', s.role, 'signed_by', s.signed_by, 'signer_name', s.signer_name, 'signature_png', s.signature_png, 'signed_at', s.signed_at, 'decision', s.decision, 'reserves', s.reserves) ORDER BY s.signed_at) FROM logistics_delivery_note_signatures s WHERE s.note_id = n.id), '[]'::jsonb),
    'events', '[]'::jsonb) ORDER BY n.created_at DESC)
    FROM logistics_delivery_notes n JOIN logistics_trips t ON t.id = n.trip_id
    WHERE n.client_id = m.client_id AND n.tenant_id = m.tenant_id AND n.country_id = m.country_id), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.b2b_portal_delivery_notes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_portal_delivery_notes() TO authenticated;