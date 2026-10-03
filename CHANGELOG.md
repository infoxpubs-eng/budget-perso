# Changelog

Toutes les évolutions notables de ce projet seront documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit les principes du [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Idées / backlog

- Historique réel vs prévisionnel
- Alertes d'échéance (notifications en amont des gros débits)

## [0.12.0] — 2026-10-03

### Ajouté

- **Renommage** (✏️) des catégories et sous-catégories depuis la console d'administration : édition en ligne (Entrée pour valider, Échap pour annuler), doublons refusés ; l'identifiant technique est inchangé, les écritures existantes suivent le nouveau libellé
- **Activation / désactivation** (⏸️ / ▶️) des catégories et sous-catégories, **sans suppression** :
  - un élément désactivé (grisé, badge « désactivée ») disparaît des formulaires de dépense/revenu, du formulaire d'ajout de couple et de la reconnaissance de l'import CSV
  - les dépenses existantes conservent leurs données : libellés et enveloppes restent résolus à l'affichage et les montants restent comptés dans les totaux du mois
  - réversible en un clic ; le filtre « active » exclut aussi les sous-catégories des options de revenu
- Nouvelles fonctions dans `taxonomie.js` : `renameCategory`, `renameSubcategory`, `setCategoryActive`, `setSubActive` (pures) ; `depenseCats`, `revenuOptions`, `catByLabel`, `subByLabel`, `subByOperation` ignorent les éléments désactivés ; `migrateState` normalise le drapeau `active`
- Corrigé au passage : `migrateState` n'appliquait pas la normalisation (indicateurs, champs manquants) à la nomenclature par défaut d'un état sans `taxonomie`

## [0.11.0] — 2026-10-03

### Ajouté

- **Console d'administration de la nomenclature** (onglet « 🛠️ Admin »)
  - Liste de toutes les catégories et sous-catégories avec nature (dépense/revenu) et enveloppe budgétaire, et le nombre de dépenses récurrentes qui les utilisent
  - Indicateurs par sous-catégorie : **récurrente 🔁** et/ou **incompressible 🔒**, modifiables en un clic
    - une sous-catégorie incompressible rend toutes ses dépenses incompressibles dans les totaux du mois (KPI, répartition incompressible/discrétionnaire, marqueur 🔒 des opérations) et coche automatiquement « incompressible » dans les formulaires de dépense
    - les indicateurs apparaissent aussi dans les sélecteurs de sous-catégorie des formulaires
  - **Ajout d'un couple** catégorie · sous-catégorie : sous une catégorie existante ou dans une nouvelle catégorie (nature, enveloppe, nature de sous-catégorie redéfinissable — ex. remboursement)
- La nomenclature devient **dynamique et persistée** (`state.taxonomie`) : toutes les fonctions de recherche (`taxCat`, `taxSub`, `labelOf`, `envelopeOf`, `depenseCats`, `revenuOptions`, `catByLabel`, `subByLabel`, `subByOperation`, `parseCsv`) acceptent une nomenclature explicite, par défaut celle de référence ; `migrateState` la fournit et la normalise
- Nouvelles fonctions dans `taxonomie.js` : `defaultTaxonomie`, `slugify`, `addCategory`, `addSubcategory`, `setSubFlags`, `subIncompressible`

## [0.10.1] — 2026-10-03

### Corrigé

- `setMonthIdx` obsolète (renommé `setSelKey` en 0.10.0) encore appelé dans « Importer JSON » et « Réinitialiser » : les deux boutons plantaient avec `ReferenceError: setMonthIdx is not defined` ; ils réinitialisent désormais la sélection de mois (`setSelKey(null)`)

## [0.10.0] — 2026-10-03

### Ajouté

- **Historique enchaîné depuis le relevé importé** : le solde de départ s'applique désormais à la **date chargée la plus lointaine** du relevé (mois chargé le plus ancien) au lieu du début du mois courant
  - Les mois entre cette date et le mois courant forment un **historique** (annoté « (historique) » dans le sélecteur) : ils enchaînent le solde d'un mois sur l'autre, mois chargés et dépenses récurrentes comprises
  - Le mois 1 (mois courant) s'ouvre sur le **solde résultant de l'historique** — le champ « Solde de départ » est le solde à la date chargée la plus lointaine (info-bulle et sous-titre explicites)
  - Les mois chargés au-delà de la fenêtre de 12 mois restent enchaînés depuis la fin de fenêtre
  - Sans relevé importé : comportement inchangé (solde de départ en début de mois 1)
- Nouvelle fonction dans `budget.js` : `simStart(state, defaultY, defaultM)` (point d'ancrage de la simulation) ; `simulate(state, startY, startM, opening?)` accepte un solde d'ouverture explicite

### Tests

- 6 nouveaux tests (83 au total) : `simStart` (défaut, mois chargé le plus ancien, mois postérieurs ignorés) et `simulate` avec ouverture explicite (ouverture fournie, défaut, équivalence avec l'enchaînement manuel de `monthSim`)

## [0.9.0] — 2026-10-03

### Ajouté

- **Indicateur « Solde actuel »** dans l'Aperçu, entre « Dépenses du mois » et « Solde fin de mois » : solde du mois affiché à la date d'aujourd'hui (jour clampé au nombre de jours du mois)
  - Mois en cours : c'est le solde prévisionnel « aujourd'hui » (indice `aujourd'hui`)
  - Autre mois : projection à pareille date du mois affiché (indice `au {jour} {mois}`)
  - Passé en rouge si négatif, comme le solde de fin de mois

## [0.8.0] — 2026-10-03

### Ajouté

- **Sélecteur de mois filtrable sur les mois chargés** 🧾 : un bouton « Mois chargés » restreint le menu déroulant aux mois contenant des données chargées (dépense exceptionnelle ou revenu unique, typiquement importés d'un relevé) ; les mois chargés sont marqués 🧾 dans la liste
  - Les mois chargés **hors de la fenêtre de 12 mois** (ex. un relevé du mois précédent importé après coup) apparaissent désormais dans le sélecteur, annotés « (hors fenêtre) », et s'affichent comme n'importe quel mois (solde d'ouverture = solde de départ)
  - Les flèches ← → naviguent dans la liste filtrée ; repli automatique sur la liste complète si aucun mois n'est chargé
- **Identification des sous-catégories récurrentes** dans les formulaires de dépense (récurrente et exceptionnelle) : les sous-catégories déjà couvertes par une dépense récurrente sont marquées « · récurrente » (avec 🔒 si incompressible), et un avertissement rappelle combien de dépenses récurrentes la couvrent et leurs libellés
- Nouvelles fonctions dans `budget.js` : `monthSim(state, y, m, opening)` (vue d'un mois isolé, même forme que `simulate()`), `loadedMonths(state)` (mois chargés, triés, sans doublon) ; `simulate()` refactoré pour réutiliser `monthSim`

### Tests

- 5 nouveaux tests (77 au total) : `monthSim` identique au premier mois de `simulate()`, chaînage du solde, mois vide, liste des mois chargés (tri, doublons, revenus uniques) et liste vide

## [0.7.0] — 2026-10-03

### Modifié

- **Import CSV : l'intitulé des écritures redevient le libellé simple** (sous-catégorie, sinon catégorie) — correction du comportement v0.6.0 : le libellé de l'opération bancaire n'est plus utilisé comme intitulé
- **La colonne « Libellé opération » sert désormais d'aide à la détermination** : quand la colonne Sous-Catégorie est inconnue, la sous-catégorie est déduite par recherche d'inclusion du libellé de sous-catégorie dans le libellé d'opération (accents et casse ignorés, libellés trop courts ignorés)
- Nouvelle fonction dans `taxonomie.js` : `subByOperation(catId, opLabel)` (recherche par inclusion tolérante)

### Tests

- Bloc de tests « Libellé opération » réécrit pour le comportement v0.7.0 : intitulé simple conservé, déduction de la sous-catégorie (ex. « PAIEMENT CARREFOUR ALIMENTATION COURSES » → Alimentation), repli sur la catégorie, `subByOperation` directement testée — **72 tests** au total

## [0.6.0] — 2026-10-03

### Ajouté

- **Colonne « Libellé opération » supportée à l'import CSV** : les exports détaillés du type `Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;` sont reconnus
  - Le libellé réel de l'opération (ex. « PRELEVEMENT EUROPEEN DE: FREE MOBILE… ») devient l'intitulé de l'écriture importée — plus parlant que le libellé de la sous-catégorie
  - Comportement inchangé pour les exports sans cette colonne, ou quand le libellé est vide : repli sur le libellé de la sous-catégorie (ou de la catégorie)
  - Détection tolérante : toute colonne d'en-tête contenant « libell… » est utilisée
- 4 nouveaux tests (70 au total) : lecture du format détaillé, repli sans colonne / libellé vide, propagation du libellé jusqu'aux écritures

## [0.5.0] — 2026-10-01

### Ajouté

- **Anti-doublons à l'import CSV** : une ligne du relevé qui correspond à une écriture déjà planifiée n'est plus importée en double
  - Dépenses : même catégorie et sous-catégorie, même montant à 0,01 € près, mois compatible avec la fréquence (annuelle → le mois prévu uniquement) ; chaque écriture planifiée n'est consommée qu'une fois
  - Revenus : même montant à 0,01 € près, catégorie bancaire comparée quand le revenu planifié en précise une ; les revenus « uniques » ne s'appliquent qu'à leur date prévue
  - Le récapitulatif avant import affiche le nombre de lignes déjà planifiées (non importées), à côté des nouvelles dépenses / revenus
- **Workflow « Tag release »** (`.github/workflows/tag-release.yml`) : à chaque push sur `main`, le tag `v{version}` (lu depuis `package.json`) est créé s'il n'existe pas encore
- Nouvelles fonctions exportées dans `src/lib/import-csv.js` : `matchesPlannedExpense`, `matchesPlannedIncome` ; `rowsToEntries(rows, planned?)` accepte les écritures planifiées
- 11 nouveaux tests (66 au total) : anti-doublons dépenses (mensuelle / annuelle / consommation unique), rapprochement revenus (fixe, salaire avec catégorie, unique à la date prévue)

## [0.4.0] — 2026-10-01

### Ajouté

- **Import de relevé bancaire CSV** (bouton 🧾 « Relevé CSV ») : lit le format d'export `Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;` (séparateur `;`, CRLF, BOM, guillemets et lignes vides tolérés)
  - Montants au format français (« -22,67 ») : les débits deviennent des **dépenses exceptionnelles** à leur date réelle, les crédits des **revenus uniques** (mode « unique »)
  - Rapprochement automatique Catégorie / Sous-Catégorie avec la nomenclature bancaire v0.3.0 (accents, casse, «…» et parenthèses ignorés) ; une sous-catégorie inconnue reste importée sans sous-catégorie ; les lignes à catégorie inconnue, date ou montant illisible sont ignorées et signalées
  - Récapitulatif avant import (nombre de dépenses / revenus, totaux, lignes ignorées, catégories inconnues)
- **Mode de revenu « unique »** : entrée d'argent versée une seule fois, à un jour et un mois précis (jour + selecteur de mois dans le formulaire ; affichage « une seule fois » dans la liste) — aussi utile en dehors de l'import
- Nouveau module `src/lib/import-csv.js` (pur, testable) : `parseCsv`, `parseFrDate`, `parseFrAmount`, `rowsToEntries` + correspondance par libellé dans `taxonomie.js` (`normalizeLabel`, `catByLabel`, `subByLabel`)
- 12 nouveaux tests (55 au total), dont l'analyse d'un extrait de relevé réel (7 lignes, rapprochement complet, 131,71 € de dépenses / 2,70 € de revenus)

## [0.3.0] — 2026-10-01

### Ajouté

- **Nomenclature bancaire à 2 niveaux** (`src/lib/taxonomie.js`) : 22 grandes catégories et ~48 sous-catégories alignées sur le relevé bancaire (Logement, Vie quotidienne, Loisirs, Voyages et Transports, Santé, Abonnements et téléphonie, Services financiers, Impôts et Taxes, Auto et Moto, Cadeaux et solidarité, Emprunts, Dépenses d'épargne, Frais professionnels, Virements, Retraits, Mouvements internes, Revenus…)
- **Sélecteurs Catégorie + Sous-catégorie** dans les formulaires de dépenses récurrentes et exceptionnelles ; badge catégorie + sous-catégorie dans les listes
- **Catégorie bancaire optionnelle sur les revenus** (select « Catégorie bancaire » : Revenus du travail, Revenus d'épargne, Remboursements, Virements reçus, Mouvements internes créditeurs, Remboursement impôts…), affichée en badge dans la liste
- **Détail par catégorie bancaire sous chaque enveloppe** dans l'onglet Budget (quelles catégories alimentent chaque enveloppe et pour quels montants)
- 10 nouveaux tests (43 au total) : intégrité de la taxonomie, rattachement enveloppes, migration des anciennes catégories, ventilation par catégorie bancaire

### Modifié

- Les 6 **enveloppes budgétaires** (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages, Exceptionnelles) sont conservées : chaque dépense est rangée automatiquement dans son enveloppe via sa catégorie bancaire (`envelopeOf`), les dépenses exceptionnelles restant dans « Exceptionnelles »
- `CATS` (6 catégories plates) remplacé par `ENVELOPPES` ; `monthlyExpenses` renvoie désormais `byEnv` / `incByEnv` (enveloppes), `byCat` / `incByCat` (catégories bancaires) et `detail` (`env|cat|sub` → montant)
- `migrateState` convertit automatiquement les anciennes catégories plates vers la nomenclature bancaire (`LEGACY_CATS`) : une sauvegarde v0.2.x est utilisable telle quelle en v0.3.0
- La sous-catégorie « Club / association » alimente l'enveloppe « Sports & autres » ; les autres sous-catégories suivent la catégorie

## [0.2.1] — 2026-10-01

### Ajouté

- **Publication web via GitHub Pages** : déploiement automatique à chaque push sur `main` (workflow `.github/workflows/deploy.yml` — build puis mise en ligne de `dist`)
- Base Vite `base: "/budget-perso/"` adaptée à l'hébergement GitHub Pages
- Section « Version en ligne » dans le README

## [0.2.0] — 2026-10-01

### Ajouté

- **Dépenses exceptionnelles** : dépenses unitaires à date précise (jour + mois de la fenêtre de 12 mois), catégorisables et marquables incompressibles
- **Dépenses incompressibles** : indicateur 🔒 sur chaque dépense (récurrente ou exceptionnelle), badge dans les listes et dans les infobulles des graphiques, et carte « Incompressible vs discrétionnaire » (montants et pourcentages) dans l'onglet Budget
- **Revenus type « salaire »** : versés l'avant-veille du dernier jour ouvré du mois (calcul automatique, week-ends franchis) ; le jour effectif s'adapte à chaque mois
- **13ᵉ mois en 2 fois** : option par salaire — une ½ versée avec le salaire de juin, l'autre avec celui de novembre
- **Bonus estimé** : option par salaire, versé avec le salaire de mars
- **Persistance renforcée** : sauvegarde automatique à chaque modification + **export / import JSON** (📤 / 📥) + réinitialisation (♻️) ; migration automatique des anciennes sauvegardes (`migrateState`) vers le nouveau schéma
- Nouvelle catégorie « Exceptionnelles » dans le budget prévisionnel
- 15 nouveaux tests unitaires (33 au total) : jours de paie (dont franchissement de week-end), 13ᵉ mois, bonus de mars, dépenses exceptionnelles, migration d'état, agrégats incompressible/discrétionnaire

### Modifié

- `expensesByCat` remplacé par `monthlyExpenses(state, y, m)` (par catégorie + répartition incompressible, dépenses récurrentes et exceptionnelles confondues)

## [0.1.0] — 2026-10-01

### Ajouté

- Application « Budget prévisionnel » (React + Vite + Tailwind CSS v4) :
  - Gestion des **dépen
ses récurrentes** : libellé, montant, jour de débit (1–31), catégorie (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages), fréquence mensuelle ou annuelle
  - Gestion des **revenus récurrents** avec date de crédit
  - **Graphique d'évolution du solde** jour par jour, avec détail des opérations au survol
  - **Flux quotidien** : barres vertes/rouges montrant à quel moment l'argent entre et sort
  - **Projection sur 12 mois** : solde prévisionnel de fin de mois avec report d'un mois sur l'autre
  - **Budget prévisionnel par catégorie** : enveloppes éditables, barres de progression et alerte de dépassement
  - **Alerte découvert** : mise en évidence du point le plus bas du mois si le solde devient négatif
  - Persistance locale des données (localStorage)
- Module de logique métier pure `src/lib/budget.js` (sans dépendance React)
- Suite de tests unitaires **Vitest** (`src/lib/budget.test.js`)
- Workflow GitHub Actions **CI** exécutant les tests à chaque push / pull request
- `README.md` (présentation, démarrage rapide, structure, référence de la logique métier)
