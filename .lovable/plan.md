## Nouveau module "Configuration des stations"

Création d'un module pour gérer, par station, les **cuves** (capacité réelle, produit), les **pompes** (identifiant, produit) et les **liaisons pompe → cuve**. Accessible depuis l'onglet "Stations" (à côté du bouton « Ajouter une station »).

### 1. Base de données (migration Supabase)

**Table `tanks` (cuves)**
- `station_id` (uuid, requis)
- `name` (texte, ex. "Cuve Super 1")
- `product_type` ('super' | 'gasoil')
- `capacity_liters` (numérique, capacité réelle)
- `notes` (texte, optionnel)

**Table `pumps` (pompes)**
- `station_id` (uuid, requis)
- `name` (texte, ex. "Pompe Super 1")
- `product_type` ('super' | 'gasoil')
- `tank_id` (uuid, optionnel — la cuve à laquelle la pompe est reliée)
- `position` (entier, ordre d'affichage)

**RLS** :
- Lecture : tout utilisateur authentifié
- Insertion / mise à jour / suppression : Admin uniquement (cohérent avec `stations`)

**Sécurité** : trigger empêchant qu'une pompe soit liée à une cuve d'un produit différent (super ↔ gasoil) ou d'une autre station.

### 2. Interface — onglet "Configuration"

Ajout d'un nouvel onglet sous **Stations** (à côté de la liste actuelle) intitulé **« Configuration des cuves & pompes »**.

Structure :
```text
[ Sélecteur de station ▾ ]

┌─ Cuves ─────────────────────┐  ┌─ Pompes ────────────────────┐
│ Cuve Super 1   30 000 L  ✎🗑│  │ Pompe Super 1 → Cuve Super 1│
│ Cuve Gasoil 1  25 000 L  ✎🗑│  │ Pompe Gasoil 1 → Cuve Gas. 1│
│ + Ajouter une cuve          │  │ + Ajouter une pompe         │
└─────────────────────────────┘  └─────────────────────────────┘
```

- **Cuves** : liste + dialog (nom, produit, capacité L)
- **Pompes** : liste + dialog (nom, produit, cuve liée via select filtré par produit)
- Suppression avec confirmation
- Validation : capacité > 0, nom unique par station

### 3. Hooks et composants

- `src/hooks/useTanks.ts` — CRUD cuves
- `src/hooks/usePumps.ts` — CRUD pompes
- `src/components/stations/StationConfigModule.tsx` — UI principale
- `src/components/stations/TankDialog.tsx` — création/édition cuve
- `src/components/stations/PumpDialog.tsx` — création/édition pompe (avec liaison cuve)
- Ajout d'un système d'onglets dans la page Stations (Tabs shadcn) : « Liste » (existant) et « Configuration ».

### 4. Notes importantes

- Ce module **n'altère pas** le schéma existant `index_entries` (super1/super2/gasoil1/gasoil2). Les cuves et pompes sont introduites comme structure de référence, prête pour une évolution future de la saisie.
- Respect du design system : cartes glassmorphisme, accents orange/ambre, pas de classes Tailwind brutes pour les couleurs.
- Réservé aux **Admins** pour la modification (Managers/Opérateurs en lecture seule).

Souhaitez-vous que je procède ?
