# Référentiels pétroliers multi-pays

## Constat (existant)
- Déjà présents et à réutiliser : `stations`, `tanks` (cuves, capacité), `pumps` (pompes liées à une cuve), écran « Configuration des cuves & pompes ».
- Le produit est aujourd'hui un simple texte `super` / `gasoil` partout (cuves, pompes, index, commandes, dépotages…).
- Absents : produits, dépôts, pistolets, unités de mesure, types d'équipements, statuts actif/inactif/maintenance.

## Ce qui sera ajouté (sans rien supprimer)
1. **Produits pétroliers** par société + pays : code, nom, couleur, unité, statut. Création automatique de « Super » et « Gasoil » pour chaque couple société/pays existant.
2. **Unités de mesure** (Litre, m³, kg, tonne…) : catalogue commun + unités propres à une société.
3. **Types d'équipements** (cuve enterrée/aérienne, pompe simple/double/multi-produits, pistolet…).
4. **Dépôts** par pays : nom, localisation, capacité, statut.
5. **Pistolets** : station, pompe, cuve, produit, numéro, statut.
6. **Statuts** actif / inactif / maintenance ajoutés aux stations, cuves et pompes (valeur par défaut « actif »).
7. **Liens produits** : colonne `product_id` ajoutée aux cuves, pompes et pistolets, remplie depuis `super`/`gasoil`. L'ancien texte reste en place pour ne rien casser.
8. **Migration des pompes** : chaque pompe existante reçoit un pistolet par défaut, relié à sa cuve et à son produit.
9. **Contrôle** : un pistolet doit utiliser le même produit que sa cuve et appartenir à la même station que sa pompe.

## Écrans (menu Configuration, réutilisant l'écran actuel)
- Onglets : Produits · Dépôts · Stations · Cuves & pompes & pistolets · Unités · Types d'équipements.
- Chaque liste : recherche, filtres (statut, produit, station), badge de statut.
- Historique minimal : panneau « Historique » par élément, lu depuis le journal d'audit existant.

## Fin de mission
- Test des pages existantes (Dashboard, Stock, Saisie index, Historique, Dépotages, Commandes, Configuration) et liste des anomalies **avant** toute correction.

## Détails techniques
- Nouvelles tables : `petroleum_products`, `units_of_measure`, `equipment_types`, `depots`, `nozzles` ; toutes avec `tenant_id` + `country_id` (sauf catalogue global), GRANT, RLS `can_access_tenant_country`, RESTRICTIVE `tenant_write_allowed`, `can_write_module` (module `stations`/`cuves`), triggers `set_tenant_country_context`, `zz_audit`, `update_updated_at`.
- Colonnes additives nullables : `status` (défaut 'active', CHECK active|inactive|maintenance), `product_id`, `equipment_type_id`, `unit_id` sur stations/tanks/pumps ; `depot_id` optionnel sur stations.
- Backfill `product_id` par correspondance (tenant, country, code). Trigger de cohérence pistolet ↔ cuve ↔ produit.
- Hooks `useProducts`, `useDepots`, `useNozzles`, `useUnits`, `useEquipmentTypes` via `useScope`.
- La saisie d'index reste par pompe dans cette étape (passage par pistolet proposé ensuite).
