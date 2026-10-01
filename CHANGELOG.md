# Changelog

Toutes les évolutions notables de ce projet seront documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit les principes du [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Idées / backlog

- Historique réel vs prévisionnel
- Alertes d'échéance (notifications en amont des gros débits)

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
