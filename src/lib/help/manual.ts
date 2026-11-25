// Manuel de formation intégré : une fiche pratique par module clé.
export type HelpSection = { id: string; number: number; title: string; summary: string; blocks: { heading: string; points: string[] }[] };

export const MANUAL: HelpSection[] = [
  { id: "command_center", number: 3, title: "Command Center & Pilotage Décisionnel", summary: "Lire les indicateurs du réseau et réagir aux alertes.", blocks: [
    { heading: "Lecture des KPI", points: ["Les ventes affichées proviennent des clôtures validées ou, à défaut, des index saisis.", "La période par défaut est la veille (N-1) : les saisies du jour sont encore en attente de validation.", "Comparez litres et montants (FCFA) par produit : Super et Gasoil sont toujours distincts."] },
    { heading: "Alertes stock", points: ["Orange = cuve sous le seuil de surveillance ; rouge = sous le seuil critique.", "Cliquez sur une station pour ouvrir le détail de ses cuves.", "Une alerte critique doit déclencher une demande d'approvisionnement."] },
    { heading: "Filtres multi-stations", points: ["Le sélecteur de pays et de station en haut limite toutes les données affichées.", "« Toutes les stations » donne la vue consolidée du réseau autorisé.", "Vous ne voyez que les pays et stations attribués à votre profil."] },
  ] },
  { id: "index", number: 4, title: "Saisie des Index Pompes", summary: "Saisir les compteurs de chaque pistolet sans rupture.", blocks: [
    { heading: "Règle de continuité d'index", points: ["L'index de départ est repris automatiquement de l'index d'arrivée de la veille.", "Un index d'arrivée inférieur à l'index de départ est refusé.", "Les jours doivent être saisis et validés dans l'ordre chronologique."] },
    { heading: "Retours cuve", points: ["Saisissez par pistolet les litres remis en cuve (essais, jaugeage, étalonnage).", "Le retour cuve est déduit des litres vendus, jamais des index."] },
    { heading: "Calcul des litres nets", points: ["Litres vendus = index d'arrivée − index de départ.", "Litres nets = litres vendus − retour cuve.", "Montant = litres nets × prix du produit en vigueur."] },
    { heading: "Validation", points: ["La saisie est « pré-enregistrée » jusqu'à validation par une autre personne (N+1).", "Une saisie rejetée revient à corriger avec le motif indiqué."] },
  ] },
  { id: "cloture", number: 5, title: "Ventes & Clôture Journalière", summary: "Ventiler les encaissements et équilibrer la journée.", blocks: [
    { heading: "Ventilation des encaissements", points: ["Répartissez la vente entre espèces, Mobile Money, cartes et bons clients.", "Les bons et cartes sont des créances : ils ne font pas partie du versement banque.", "Montant à verser = vente − bons − MoMo − cartes."] },
    { heading: "Équilibrage", points: ["L'écart de caisse = total encaissé − total des ventes ; il doit être nul ou justifié.", "Tout écart doit être commenté avant soumission."] },
    { heading: "Validation N+1", points: ["Le gérant soumet la clôture, un responsable différent la valide.", "Une clôture validée est verrouillée ; une réouverture est tracée et corrige le stock par mouvement."] },
  ] },
  { id: "stock", number: 6, title: "Gestion des Stocks & Jauges", summary: "Comparer le stock physique au stock théorique.", blocks: [
    { heading: "Jauge physique vs théorique", points: ["Théorique = stock d'ouverture + dépotages − sorties (ventes).", "Physique = jauge mesurée en fin de journée.", "Écart = physique − théorique ; un écart négatif répété est suspect."] },
    { heading: "Seuils", points: ["Seuil de surveillance : prévoir une commande.", "Seuil critique : risque de rupture, commande urgente.", "Les jauges sont calculées sur la capacité réelle de chaque cuve."] },
    { heading: "Détection des coulages", points: ["Surveillez les écarts négatifs persistants sur une même cuve.", "Croisez avec les retours cuve et les dépotages du jour.", "Toute correction passe par un mouvement de stock tracé, jamais par une modification directe."] },
  ] },
  { id: "depotage", number: 7, title: "Logistique & Dépotages", summary: "Réceptionner un camion-citerne en contrôlant chaque étape.", blocks: [
    { heading: "Contrôle à l'arrivée", points: ["Vérifiez l'intégrité des scellés et leur numéro face au bon de livraison (BL).", "Contrôlez le produit et la quantité chargée indiqués sur le BL."] },
    { heading: "Jauges avant / après", points: ["Relevez la jauge de la cuve avant le dépotage.", "Relevez-la à nouveau après stabilisation.", "Quantité reçue = jauge après − jauge avant."] },
    { heading: "Calcul des écarts", points: ["Écart = quantité reçue − quantité du BL.", "Comparez l'écart à la tolérance (ex. 0,5 %) : au-delà, signalez-le au transporteur.", "Le stock est mis à jour à la quantité du BL ; l'écart reste visible côté camion."] },
  ] },
  { id: "b2b", number: 8, title: "Clients B2B & Flottes", summary: "Suivre les clients professionnels, leurs plafonds et leur facturation.", blocks: [
    { heading: "Plafonds de crédit", points: ["Chaque client a un plafond partagé entre achats B2B et cartes carburant postpayées.", "Un achat dépassant le plafond est bloqué."] },
    { heading: "Consommations par véhicule", points: ["Les consommations sont rattachées au client, à la station, au produit et au véhicule.", "Analysez les volumes anormaux par véhicule."] },
    { heading: "Facturation", points: ["Les factures regroupent les consommations d'une période.", "Les paiements partiels réduisent le solde restant dû."] },
  ] },
  { id: "reconciliation", number: 9, title: "Réconciliation Financière", summary: "Rapprocher les encaissements des versements bancaires.", blocks: [
    { heading: "Rapprochement", points: ["Comparez les montants attendus (clôtures) aux versements banque et MoMo.", "Le calcul est relancé par station et par jour, toujours de la même façon."] },
    { heading: "États de conformité", points: ["Conforme : écart dans la tolérance.", "À justifier : écart au-delà de la tolérance, le contrôleur documente sa décision.", "Chaque décision est conservée dans l'historique."] },
  ] },
  { id: "ateliers", number: 10, title: "Ateliers pratiques pas-à-pas", summary: "Exercices à réaliser en mode démo.", blocks: [
    { heading: "Atelier 1 — Saisie d'une journée (Gérant)", points: ["Ouvrez « Saisie Index » et vérifiez les index de départ repris.", "Saisissez les index d'arrivée, un retour cuve et les jauges.", "Ventilez les encaissements puis enregistrez."] },
    { heading: "Atelier 2 — Validation N+1 (Directeur)", points: ["Basculez sur le profil Directeur dans le bandeau démo.", "Ouvrez l'historique et validez la saisie du gérant.", "Contrôlez la clôture générée et le stock mis à jour."] },
    { heading: "Atelier 3 — Réception d'un camion (Superviseur)", points: ["Basculez sur le profil Superviseur Logistique.", "Enregistrez un dépotage avec jauges avant/après et calculez l'écart.", "Vérifiez la cuve dans l'écran Stocks."] },
    { heading: "Atelier 4 — Analyse du réseau", points: ["Dans le Command Center, identifiez la cuve la plus basse.", "Comparez les ventes Super et Gasoil des 4 stations.", "Repérez une non-conformité ouverte dans HSE et une panne dans Maintenance."] },
  ] },
];

/** Onglets / écrans → fiche du manuel. */
export const HELP_FOR_SCREEN: Record<string, string> = {
  command: "command_center", command_center: "command_center", bi: "command_center",
  ventes: "index", saisie: "index", index: "index", historique: "index",
  ventes_cloture: "cloture", cloture: "cloture",
  stock: "stock", cuves: "stock", moteur_stock: "stock",
  depotage: "depotage", logistique_avancee: "depotage", commandes: "depotage",
  b2b: "b2b", clients_b2b: "b2b", clients: "b2b", fuel_cards: "b2b",
  reconciliation: "reconciliation", etats_synthese: "reconciliation",
};

export const openHelp = (section?: string) => window.dispatchEvent(new CustomEvent("open-help", { detail: section }));
