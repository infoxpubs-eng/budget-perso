# Changelog

Toutes les évolutions notables de ce projet seront documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit les principes du [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Idées / backlog

- Historique réel vs prévisionnel
- Alertes d'échéance (notifications en amont des gros débits)

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
