# 💰 Budget prévisionnel — budget-perso

Application React de gestion de budget personnel qui répond à une question simple :
**« À quel moment du mois mes dépenses sont-elles débitées, et où va se retrouver mon solde en fin de mois ? »**

## Fonctionnalités

- **Dépenses récurrentes** : montant, jour de débit (1–31), catégorie, fréquence mensuelle ou annuelle
- **Revenus récurrents** : même logique avec la date de crédit
- **Graphique d'évolution du solde** : courbe quotidienne du mois, survolable pour voir chaque opération débitée / créditée
- **Flux quotidien** : barres vertes (entrées) / rouges (sorties) par jour du mois
- **Projection 12 mois** : solde prévisionnel de fin de mois, chaque mois reprenant le solde prévu du précédent
- **Budget par catégorie** : enveloppes éditables (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages) avec alerte de dépassement
- **Alerte découvert** : point le plus bas du mois mis en évidence si le solde devient négatif
- **Persistance locale** : les données sont sauvegardées dans le navigateur (localStorage)

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
| `transactionsOfMonth(state, y, m)` | Opérations du mois, triées par jour (jour 31 ramené à la fin des mois courts) |
| `simulate(state, startY, startM)` | Simulation de 12 mois enchaînés : solde quotidien, point bas, totaux |
| `expensesByCat(expenses, m)` | Total planifié par catégorie pour un mois |

Le modèle de données est volontairement simple :

```js
{
  soldeDepart: 1500,
  expenses: [{ id, label, amount, day, cat, freq, month? }],
  incomes:  [{ id, label, amount, day, freq, month? }],
  budgets:  { domestiques: 1000, ... }   // enveloppes par catégorie
}
```

## Tests

La suite couvre : années bissextiles, tri et signe des opérations, exclusion des dépenses annuelles hors de leur mois, clamp du jour 31, enchaînement des soldes d'un mois à l'autre, détection de découvert, passage à l'année suivante et agrégats par catégorie.

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
