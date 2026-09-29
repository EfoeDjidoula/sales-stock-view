# Ventes, index et clôture journalière

## Objectif

Un module « Ventes station » où l'on saisit les ventes par pistolet. Une clôture journalière regroupe ces ventes. Quand elle est validée, elle crée les mouvements de stock « vente » correspondants. Toutes les opérations sont tracées dans le journal système.

## Ce que l'utilisateur verra

Nouvel onglet **Ventes & clôture** (Suivi & Analyse), avec 4 sous-onglets :

1. **Saisie des ventes** : on choisit une date et une station. Une ligne apparaît pour chaque pistolet actif (pompe, produit et cuve sont repris automatiquement). On saisit l'index de début, pré-rempli avec l'index de fin de la veille, puis l'index de fin. Le volume est calculé automatiquement. On peut aussi saisir le volume à la main quand il n'y a pas d'index. Le prix unitaire est repris de la structure de prix active, sinon 695 / 720 FCFA. Il est modifiable si l'utilisateur a le droit de le faire.
2. **Encaissements** : on saisit le montant et une référence pour chaque mode de paiement.
3. **Clôture du jour** : ventes par produit, ventes par pistolet, volume total, montant total, encaissements par mode. On y voit aussi l'écart (encaissé − montant des ventes) et l'écart de stock pour chaque cuve. Les boutons Soumettre, Valider, Rejeter (avec un motif) et Rouvrir (avec un motif) s'affichent selon les droits.
4. **Historique des clôtures** : filtres par station, statut et période, avec le détail des changements d'état.

**Modes de paiement** (paramétrables par société et par pays) : Espèces, Carte bancaire, Ticket valeur, Mobile Money, Carte carburant prépayée, Carte carburant post-payée, Autoconso, Crédit B2B et Autres. On peut en ajouter, les renommer ou les désactiver.

## Règles métier

- Statuts : Brouillon → Soumis → Validé, ou Rejeté (retour possible en brouillon).
- Une clôture soumise ou validée est verrouillée : on ne peut plus modifier ses ventes ni ses encaissements.
- **Réouverture** d'une clôture validée : réservée à un validateur, avec un motif obligatoire. Elle est inscrite dans l'historique et dans le journal système. Les mouvements de stock déjà créés ne sont jamais effacés : un ajustement inverse est enregistré, puis de nouveaux mouvements sont créés à la prochaine validation.
- Une seule clôture par station et par jour. Pas de valeur négative. L'index de fin doit être supérieur ou égal à l'index de début. Pas de date dans le futur. L'exercice comptable doit être ouvert.
- **Stock** : à la validation, un mouvement « vente » est créé pour chaque cuve (somme des volumes de ses pistolets), avec la référence de la clôture.
- Les index du jour et les dépotages actuels ne sont pas modifiés : ce module est nouveau et fonctionne à côté d'eux.

## Tests prévus

Sur AUDIT CLIENT A / Bénin : saisie des ventes, calcul du volume, encaissements avec un écart, soumission, validation (vérifier les mouvements de stock créés), tentative de modification refusée, réouverture avec motif, puis nouvelle validation. On vérifie aussi l'isolation entre sociétés et le journal système.

## Détails techniques

- Tables (tenant_id + country_id, GRANT, RLS can_access_tenant_country + tenant_write_allowed + can_write_module('sales') + module gate 'ventes' + audit) :
  - `payment_methods` (code, label, kind, is_active, position), données initiales par tenant+pays.
  - `daily_closures` (station_id, closure_date unique par station, status draft|submitted|validated|rejected, totals, cash_variance, submitted/validated/rejected/reopened_by/at, reason).
  - `closure_sales` (closure_id, nozzle_id, pump_id, tank_id, product_id, index_start, index_end, volume, volume_mode index|manual, unit_price, amount).
  - `closure_payments` (closure_id, payment_method_id, amount, reference).
  - `closure_events` (historique des changements d'état, en ajout seulement).
- Triggers : calcul du volume et du montant, verrouillage hors brouillon, machine d'états. RPC `closure_transition(_id, _action, _reason)` en security definer, qui vérifie sales.validate ou le rôle platform admin et crée les stock_movements (sale / adjustment_in en cas de réouverture) en statut validated.
- Permissions : ajout de `sales.view/create/edit/validate` dans `permissions`, rattachées aux rôles système concernés.
- Frontend : `src/hooks/useDailyClosures.ts`, `src/components/sales/SalesClosureModule.tsx`, onglet dans `Index.tsx` (TAB_MODULE « ventes », RBAC sales.view).
- Règle à ajouter dans AGENTS.md pour la clôture et la création des mouvements de stock à la validation.