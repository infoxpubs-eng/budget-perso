# 💰 Budget prévisionnel — budget-perso

Application React de gestion de budget personnel qui répond à une question simple :
**« À quel moment du mois mes dépenses sont-elles débitées, et où va se retrouver mon solde en fin de mois ? »**

## Fonctionnalités

- **Dépenses récurrentes** : montant, jour de débit (1–31), catégorie, fréquence mensuelle ou annuelle
- **Dépenses exceptionnelles** : dépenses unitaires à date précise, catégorisées, intégrées à la simulation et au budget
- **Dépenses incompressibles** 🔒 : marqueur sur chaque dépense, visualisation incompressible vs discrétionnaire
- **Revenus** :
  - à **jour fixe** du mois
  - ou type **« salaire »**, versé **l'avant-veille du dernier jour ouvré du mois** (calcul automatique, week-ends franchis)
  - option **13ᵉ mois en 2 fois** : ½ versée avec le salaire de juin, ½ avec celui de novembre
  - option **bonus estimé**, versé avec le salaire de mars
- **Graphique d'évolution du solde** : courbe quotidienne du mois, survolable opération par opération
- **Flux quotidien** : barres vertes (entrées) / rouges (sorties) par jour du mois
- **Projection 12 mois** : solde prévisionnel de fin de mois avec report d'un mois sur l'autre
- **Budget par catégorie** : enveloppes éditables (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages, Exceptionnelles) avec alerte de dépassement
- **Alerte découvert** : point le plus bas du mois mis en évidence si le solde devient négatif
- **Persistance complète** : sauvegarde automatique dans le navigateur (localStorage), export / import JSON, réinitialisation, migration automatique des anciennes sauvegardes

## Démarrage rapide

```bash
npm install
npm run dev       # lance l'application (Vite)
npm test          # lance la suite de tests (Vitest)
```

## Structure du projet

```
├── index.html
├── package.json
├── vite.config.js          # Vite + Tailwind CSS v4 + configuration Vitest
├── src/
│   ├── main.jsx            # point d'entrée React
│   ├── index.css           # import Tailwind
│   ├── App.jsx             # interface complète (onglets, graphiques, formulaires)
│   └── lib/
│       ├── budget.js       # logique métier pure (simulation, agrégats) — sans React
│       └── budget.test.js  # tests unitaires Vitest de la logique métier
└── .github/workflows/ci.yml  # CI : les tests tournent à chaque push
```

## Logique métier (`src/lib/budget.js`)

Module **sans dépendance React**, donc testable isolément :

| Fonction | Rôle |
|---|---|
| `daysInMonth(y, m)` | Nombre de jours du mois (gère bissextiles) |
| `monthLabel(y, m)` | Libellé lisible (« Octobre 2026 ») |
| `freqInMonth(freq, month, m)` | Une écriture tombe-t-elle dans ce mois ? |
| `isBusinessDay`, `lastBusinessDay` | Jours ouvrés (semaine de 5 jours) |
| `salaryPayDay(y, m)` | Jour de paie : avant-veille du dernier jour ouvré |
| `migrateState(raw)` | Complète une sauvegarde avec les valeurs par défaut des nouveaux champs |
| `transactionsOfMonth(state, y, m)` | Opérations du mois : récurrentes + exceptionnelles + salaires (13ᵉ mois, bonus) |
| `simulate(state, startY, startM)` | Simulation de 12 mois enchaînés : solde quotidien, point bas, totaux |
| `monthlyExpenses(state, y, m)` | Totaux par catégorie + répartition incompressible / discrétionnaire |

Le modèle de données est volontairement simple :

```js
{
  soldeDepart: 1500,
  expenses: [{ id, label, amount, day, cat, freq, month?, incompressible? }], // récurrentes
  extras:    [{ id, label, amount, day, y, m, cat, incompressible? }],        // exceptionnelles
  incomes:  [{ id, label, amount, mode: "fixe" | "salaire", day?,             // jour fixe si "fixe"
               treizieme?,   // true => ½ du salaire en plus en juin et novembre
               bonus? }],    // montant versé avec le salaire de mars
  budgets:  { domestiques: 1000, ..., exceptionnelles: 300 }
}
```

## Tests

La suite couvre : années bissextiles, tri et signe des opérations, exclusion des dépenses annuelles hors de leur mois, clamp du jour 31, jours de paie (dont franchissement de week-end), 13ᵉ mois en juin/novembre, bonus de mars, dépenses exceptionnelles, enchaînement des soldes d'un mois à l'autre, détection de découvert, passage à l'année suivante, migration des anciennes sauvegardes et agrégats incompressible/discrétionnaire.

```bash
npm test            # une seule exécution
npm run test:watch  # mode watch
```

Une GitHub Action (`.github/workflows/ci.yml`) exécute les tests à chaque push et pull request sur `main`.

## Suivi du projet

- Les évolutions sont documentées dans le [CHANGELOG.md](CHANGELOG.md)
- Convention : une entrée de changelog par version, format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)

## Stack

- [React 18](https://react.dev) — interface
- [Recharts](https://recharts.org) — graphiques
- [Tailwind CSS v4](https://tailwindcss.com) — style
- [Vite](https://vitejs.dev) — build et serveur de dev
- [Vitest](https://vitest.dev) — tests unitaires
