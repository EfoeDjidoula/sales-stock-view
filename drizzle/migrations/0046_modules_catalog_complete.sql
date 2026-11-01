INSERT INTO public.modules (key,label,description,category,is_core,position) VALUES
('command_center','Command Center','Pilotage opérationnel temps réel','pilotage',false,280),
('bi','BI avancée','Analyses multi-pays, prévisions et IA appro','pilotage',false,290),
('cloture','Ventes & clôture journalière','Clôtures, encaissements, réouverture tracée','exploitation',false,300),
('moteur_stock','Mouvements de stock','Registre immuable, transferts, inventaires','exploitation',false,310),
('reconciliation','Réconciliation','Rapprochement index/stock/encaissements','conformite',false,320),
('logistique','Chaîne logistique & appro','Transporteurs, flotte, missions, GPS, check-in','logistique',false,330),
('hse','HSE & Conformité','Inspections, incidents, non-conformités, agents HSE','conformite',false,340),
('workflows','Workflows & approbations','Circuits d''approbation configurables','conformite',false,350),
('support','Support & tickets','Tickets clients et SLA','general',true,360),
('api_hub','API Hub & webhooks','API REST, clés et webhooks signés','general',false,370),
('integrations','Intégrations Enterprise','Connecteurs ERP, banques, Mobile Money, ATG, IoT','general',false,380),
('proforma','Proforma','Factures proforma','finance',false,390),
('exercices','Exercices comptables','Ouverture/clôture des exercices','finance',false,400)
ON CONFLICT (key) DO NOTHING;