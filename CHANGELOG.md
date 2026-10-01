# Changelog

Toutes les évolutions notables de ce projet seront documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit les principes du [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Idées / backlog

- Historique réel vs prévisionnel
- Alertes d'échéance (notifications en amont des gros débits)

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
