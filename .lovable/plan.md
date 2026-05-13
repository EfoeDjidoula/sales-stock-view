## Objectif

Faire évoluer la saisie quotidienne des index pour qu'elle s'adapte automatiquement au paramétrage **pompes & cuves** de chaque station, et calculer le **déstockage par cuve** à partir du volume cumulé sortie des pompes qui lui sont liées.

Aujourd'hui, `index_entries` impose 4 colonnes fixes (super1, super2, gasoil1, gasoil2). Nous passons à un modèle **dynamique par pompe**, tout en gardant `index_entries` pour la rétrocompatibilité (versements, bons, totaux agrégés).

---

## 1. Base de données (migration)

Nouvelle table `pump_index_entries` (1 ligne par pompe et par jour) :

- `entry_id` → FK logique vers `index_entries(id)` (cascade)
- `pump_id`, `tank_id` (snapshot de la liaison au moment de la saisie)
- `station_id`, `entry_date`, `user_id`
- `product_type` (`super` | `gasoil`)
- `index_depart`, `index_arrivee` (numeric, défauts 0)
- `liters_sold` colonne générée = `GREATEST(index_arrivee - index_depart, 0)`
- contrainte unique `(entry_id, pump_id)`
- RLS : lecture admin/manager/propriétaire ; CRUD propriétaire ; check fiscal year

Nouvelle vue `tank_destocking_daily` :

- agrège `SUM(liters_sold)` par `(tank_id, entry_date)` à partir de `pump_index_entries`
- expose `station_id`, `tank_id`, `product_type`, `entry_date`, `total_liters`

`index_entries` est conservée :
- les colonnes super1/super2/gasoil1/gasoil2 deviennent **optionnelles** (toujours là pour l'historique et les imports Excel)
- les totaux `total_super_liters` / `total_gasoil_liters` seront recalculés côté code à partir de `pump_index_entries` quand des pompes existent, sinon fallback sur les colonnes legacy.

Aucune modification destructive sur les colonnes existantes.

---

## 2. Hooks

- `usePumpIndexEntries(stationId, entryDate)` : récupère les lignes existantes pour pré-remplir.
- `usePreviousPumpIndex(stationId, pumpIds, beforeDate)` : pour pré-remplir `index_depart` à partir du dernier `index_arrivee` connu de chaque pompe.
- `useTankDestocking(stationId, range)` : lit `tank_destocking_daily` pour les modules Stock / Dashboard.
- `useSavePumpIndexEntry` : upsert sur `(entry_id, pump_id)` + invalidations React Query.

`useSaveIndexEntry` est étendu : après l'upsert de `index_entries`, il upsert également les lignes par pompe et calcule les totaux super/gasoil à partir des pompes.

---

## 3. UI — page Saisie des Index (`src/pages/IndexEntry.tsx`)

Refonte du bloc "produits" :

- Lecture du paramétrage via `usePumps(stationId)` + `useTanks(stationId)`.
- **Si la station a des pompes configurées** : affiche dynamiquement une **carte par pompe**, regroupées par **cuve liée** (ex. *Cuve Super A → Pompe S1, Pompe S2*). Chaque carte demande `index_depart` (auto-rempli depuis le dernier index connu) + `index_arrivee`. La jauge est saisie **par cuve** (1 champ par cuve, pas par pompe).
- En tête de chaque groupe cuve : affichage du **volume cumulé sortie = Σ pompes liées**, comparé à la capacité de la cuve.
- **Sinon (station sans paramétrage)** : on garde l'ancien formulaire 4 produits comme fallback (pour les stations pas encore migrées).

Versements et bons : inchangés.

---

## 4. Modules consommateurs

- **StockModule** : utilise `useTankDestocking` pour calculer le stock restant par cuve (`capacity - cumul destockage + approvisionnements`), et garde le fallback sur `total_super_liters`/`total_gasoil_liters` si pas de pompes.
- **Dashboard / SalesCard** : agrège super/gasoil depuis `pump_index_entries` quand dispo, sinon `index_entries` (transparent).
- **Import / Export Excel** : aucune modification dans ce lot — on continue à mapper sur les 4 colonnes legacy. Migration progressive prévue ensuite.

---

## 5. Contraintes & sécurité

- RLS strictes alignées sur `index_entries` (propriétaire en écriture, admin/manager en lecture).
- Trigger `check_fiscal_year_open` appliqué aussi à `pump_index_entries`.
- Trigger de validation : la pompe doit appartenir à la même station que l'entrée, et la cuve liée doit toujours matcher (snapshot vérifié).
- Aucune valeur négative (réutilisation du pattern `check_no_negative_values`).

---

## 6. Hors scope (lots futurs)

- Migration des `index_entries` historiques vers `pump_index_entries`.
- Refonte de l'import/export Excel par pompe.
- Édition `EditEntryDialog` côté pompes (le dialog actuel reste sur les 4 colonnes legacy pour l'instant).

---

## Résumé technique

```text
stations ──< tanks ──< pumps
                          │
                          ▼
              pump_index_entries (par jour, par pompe)
                          │
                          ▼
              tank_destocking_daily (vue, par cuve)
                          │
                          ▼
              StockModule / Dashboard
```

Le formulaire de saisie devient piloté par la configuration : ajouter/retirer une pompe ou changer sa cuve liée se reflète immédiatement dans l'UI de saisie et dans le calcul de déstockage.
