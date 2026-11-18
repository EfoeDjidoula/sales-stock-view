import json, os, requests, concurrent.futures as cf, sys
todo = json.load(open('/tmp/i18n/todo.json'))
done = json.load(open('/tmp/i18n/done.json')) if os.path.exists('/tmp/i18n/done.json') else {}
todo = [s for s in todo if s not in done]
SYS = """You translate the French user interface of a professional ERP for petroleum service-station networks (Benin, West Africa; currency FCFA) into concise, natural British-neutral business English.
Rules:
- Return ONLY a JSON object mapping each input string (exact key, unchanged) to its English translation.
- Keep placeholders like {x} exactly, in a sensible position. Keep punctuation style, trailing colons, ellipses, arrows, symbols, units (L, FCFA, %), and capitalisation style (ALL CAPS stays ALL CAPS).
- Keep proper names, product brands, codes and acronyms (SYSCOHADA, FCFA, LUMATEK, e-CMR, HSE, BL, RBAC, API, KPI, MoMo) unchanged.
- Domain glossary: Super = Super (petrol grade, keep), Gasoil = Diesel, index (compteur) = meter reading, index départ = start reading, index arrivée = end reading, jauge = dip reading, cuve = tank, pistolet = nozzle, pompe = pump, dépotage = unloading, retour en cuve = return to tank, clôture = daily close, versement = bank deposit, bordereau = deposit slip, gérant = station manager, approvisionnement = supply, coulage = shrinkage, péréquation = transport equalisation, bon client = customer voucher, ticket valeur = value ticket, autoconsommation = own use, pré-enregistré = pre-recorded, saisie = entry, N+1 = supervisor (N+1).
- If a string is already English or not translatable (codes, names), return it unchanged."""
def run(batch):
    for attempt in range(3):
        try:
            r = requests.post('https://ai.gateway.lovable.dev/v1/chat/completions', headers={'Authorization': 'Bearer '+os.environ['LOVABLE_API_KEY']}, json={'model':'google/gemini-3.8-flash','messages':[{'role':'system','content':SYS},{'role':'user','content':json.dumps(batch, ensure_ascii=False)}],'response_format':{'type':'json_object'}}, timeout=170)
            r.raise_for_status()
            c = r.json()['choices'][0]['message']['content'].strip()
            if c.startswith('```'): c = c.split('\n',1)[1].rsplit('```',1)[0]
            d = json.loads(c)
            return {k: v for k, v in d.items() if k in batch and isinstance(v, str)}
        except Exception as e:
            print('err', e, file=sys.stderr)
    return {}
batches = [todo[i:i+120] for i in range(0, len(todo), 120)][:int(sys.argv[1]) if len(sys.argv)>1 else 999]
with cf.ThreadPoolExecutor(8) as ex:
    for res in ex.map(run, batches):
        done.update(res)
json.dump(done, open('/tmp/i18n/done.json','w'), ensure_ascii=False, indent=0)
print(len(done), 'of', len(todo)+len(done))
