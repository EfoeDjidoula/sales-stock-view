## Objectif

Réduire l'encombrement de la barre d'onglets du tableau de bord (11 onglets à plat, qui débordent sur `flex-wrap`) en regroupant les menus par thématique métier, tout en conservant strictement les permissions par rôle existantes.

## Regroupement proposé

Les 11 menus actuels sont réorganisés en **4 groupes logiques** :

```text
📊 SUIVI & ANALYSE
   ├─ Ventes            (admin, manager, operator)
   ├─ Stock             (admin, manager, operator)
   └─ Historique        (admin, manager, operator)

🚚 LOGISTIQUE & FLUX
   ├─ Commandes         (admin, manager)
   ├─ Approvisionnements(admin, manager)
   ├─ Dépotages         (admin, manager, operator)
   └─ Camions           (admin, manager, operator)

🏗️ CONFIGURATION
   ├─ Stations & Cuves  (admin, manager, operator)
   └─ Péréquation       (admin, manager, operator)

⚙️ ADMINISTRATION
   ├─ Exercices         (admin)
   └─ Droits & Rôles    (admin)
```

La logique de regroupement :
- **Suivi & Analyse** = ce qu'on consulte au quotidien (données de vente/stock/historique).
- **Logistique & Flux** = tout le cycle d'approvisionnement physique du carburant (commande → appro → dépotage → camions).
- **Configuration** = paramétrage métier des actifs (cuves/pompes, zones de péréquation).
- **Administration** = réservé aux admins (exercices comptables, gestion des utilisateurs).

## Comportement UI

- La `TabsList` actuelle est remplacée par une barre de **4 groupes**. Chaque groupe s'ouvre en menu déroulant (`DropdownMenu`) listant ses sous-menus.
- Le libellé du groupe affiche l'onglet actif en surbrillance (ex. « Logistique & Flux · Dépotages ») pour ne pas perdre le repère de position.
- Un groupe entièrement vide pour le rôle courant (ex. « Administration » pour un opérateur) est masqué — aucune régression de sécurité.
- L'état `activeTab` et tout le contenu (`TabsContent`) restent identiques : seule la navigation change, pas les vues ni la logique métier.
- Responsive : sur mobile la barre reste compacte (4 boutons au lieu de 11).

## Détails techniques

Fichier concerné : `src/pages/Index.tsx` uniquement.

1. Ajouter une structure de configuration des groupes :
   ```ts
   const TAB_GROUPS = [
     { id: "suivi", label: "Suivi & Analyse", icon: BarChart3, tabs: ["ventes","stock","historique"] },
     { id: "logistique", label: "Logistique & Flux", icon: Truck, tabs: ["commandes","approvisionnements","depotage","camions"] },
     { id: "config", label: "Configuration", icon: Settings2, tabs: ["stations","perequation"] },
     { id: "admin", label: "Administration", icon: ShieldCheck, tabs: ["exercices","droits"] },
   ];
   ```
   avec un mapping `TAB_META` (label + icône par onglet), réutilisant les libellés/icônes déjà présents dans les `TabsTrigger`.
2. Conserver `TAB_PERMISSIONS` et `canAccessTab` inchangés.
3. Remplacer le bloc `TabsList` par une rangée de `DropdownMenu` (composant shadcn déjà présent), un par groupe. Filtrer les onglets de chaque groupe via `canAccessTab`; masquer le groupe si la liste résultante est vide.
4. Garder `<Tabs value={activeTab} onValueChange={setActiveTab}>` comme conteneur (les `TabsContent` ne bougent pas). Les items du menu appellent `setActiveTab(tab)`.
5. Mettre en surbrillance le bouton du groupe contenant `activeTab`.

Aucune modification de base de données, de hook ou de logique métier.

## Hors scope

- Pas de changement des permissions ni des vues.
- Pas de passage à une sidebar (possible évolution future si souhaité).
