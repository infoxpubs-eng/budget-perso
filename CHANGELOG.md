# Changelog

Toutes les évolutions notables de ce projet seront documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit les principes du [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Idées / backlog

- Dépenses ponctuelles (non récurrentes)
- Réglage du jour de bascule du mois (ex. bascule le 5)
- Export / import des données (JSON)
- Historique réel vs prévisionnel

## [0.1.0] — 2026-10-01

### Ajouté

- Application « Budget prévisionnel » (React + Vite + Tailwind CSS v4) :
  - Gestion des **dépenses récurrentes** : libellé, montant, jour de débit (1–31), catégorie (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages), fréquence mensuelle ou annuelle
  - Gestion des **revenus récurrents** avec date de crédit
  - **Graphique d'évolution du solde** jour par jour, avec détail des opérations au survol
  - **Flux quotidien** : barres vertes/rouges montrant à quel moment l'argent entre et sort
  - **Projection sur 12 mois** : solde prévisionnel de fin de mois avec report d'un mois sur l'autre
  - **Budget prévisionnel par catégorie** : enveloppes éditables, barres de progression et alerte de dépassement
  - **Alerte découvert** : mise en évidence du point le plus bas du mois si le solde devient négatif
  - Persistance locale des données (localStorage)
- Module de logique métier pure `src/lib/budget.js` (sans dépendance React) :
  `daysInMonth`, `monthLabel`, `freqInMonth`, `transactionsOfMonth`, `simulate`, `expensesByCat`
- Suite de tests unitaires **Vitest** (`src/lib/budget.test.js`) couvrant bissextiles, tri des opérations,
  dépenses annuelles, clamp du jour 31, enchaînement des soldes, détection de découvert et passage d'année
- Workflow GitHub Actions **CI** exécutant les tests à chaque push / pull request
- `README.md` (présentation, démarrage rapide, structure, référence de la logique métier)
