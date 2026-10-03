# 💰 Budget prévisionnel — budget-perso

Application React de gestion de budget personnel qui répond à une question simple :
**« À quel moment du mois mes dépenses sont-elles débitées, et où va se retrouver mon solde en fin de mois ? »**

## Fonctionnalités

- **Nomenclature bancaire à 2 niveaux** : chaque dépense est classée par **catégorie** (Logement, Vie quotidienne, Loisirs, Voyages et Transports, Santé, Abonnements et téléphonie, Services financiers, Impôts et Taxes, Auto et Moto, Cadeaux et solidarité, Emprunts, Dépenses d'épargne, Frais professionnels, Virements, Retraits, Mouvements internes…) et **sous-catégorie** (issue du relevé bancaire)
- **Import de relevé bancaire CSV** 🧾 : fichier d'export `Date transaction;…;Catégorie;Sous-Catégorie;Montant;Pointée;` (colonne optionnelle `Libellé opération` : aide à déduire la sous-catégorie quand elle est inconnue ; l'intitulé des écritures reste le libellé simple) — les débits deviennent des dépenses exceptionnelles à leur date réelle, les crédits des revenus uniques, avec rapprochement automatique des catégories et récapitulatif avant import ; **anti-doublons** : une ligne correspondant à une écriture déjà planifiée (même catégorie/sous-catégorie, même montant à 0,01 € près, mois compatible) n'est pas importée en double
- **Dépenses récurrentes** : montant, jour de débit (1–31), catégorie bancaire, fréquence mensuelle ou annuelle
- **Dépenses exceptionnelles** : dépenses unitaires à date précise, catégorisées, intégrées à la simulation et au budget
- **Dépenses incompressibles** 🔒 : marqueur sur chaque dépense, visualisation incompressible vs discrétionnaire
- **6 enveloppes budgétaires** (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages, Exceptionnelles) : chaque dépense est rangée automatiquement dans son enveloppe via sa catégorie bancaire ; l'onglet Budget affiche le détail des catégories qui alimentent chaque enveloppe
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

## 🌐 Accès en ligne

L'application est publiée sur GitHub Pages : **<https://infoxpubs-eng.github.io/budget-perso/>**

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
│       ├── taxonomie.js    # nomenclature bancaire à 2 niveaux (catégories, sous-catégories, enveloppes)
│       ├── import-csv.js   # import de relevé bancaire CSV (parsing FR + rapprochement des catégories)
│       ├── budget.test.js  # tests unitaires Vitest de la logique métier
│       └── import-csv.test.js  # tests unitaires Vitest de l'import CSV
├── .github/workflows/ci.yml           # CI : tests + build à chaque push
├── .github/workflows/deploy.yml       # déploiement GitHub Pages à chaque push sur main
└── .github/workflows/tag-release.yml  # tag v{version} créé à chaque push sur main
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
| `migrateState(raw)` | Complète une sauvegarde, convertit les anciennes catégories plates vers la nomenclature bancaire (`LEGACY_CATS`) |
| `transactionsOfMonth(state, y, m)` | Opérations du mois : récurrentes + exceptionnelles + salaires (13ᵉ mois, bonus) |
| `simulate(state, startY, startM)` | Simulation de 12 mois enchaînés : solde quotidien, point bas, totaux |
| `monthlyExpenses(state, y, m)` | Totaux par enveloppe (`byEnv`), par catégorie bancaire (`byCat`), détail `env\|cat\|sub` et répartition incompressible / discrétionnaire |

`src/lib/taxonomie.js` fournit la nomenclature bancaire à 2 niveaux :

| Fonction | Rôle |
|---|---|
| `TAXONOMIE` | Les 22 catégories (nature dépense/revenu) et leurs sous-catégories |
| `envelopeOf(catId, subId)` | Enveloppe budgétaire d'une dépense (sous-catégorie prioritaire) |
| `depenseCats()` | Catégories éligibles au formulaire de dépense |
| `revenuOptions()` | Options « Catégorie — Sous-catégorie » pour les revenus |
| `labelOf(catId, subId)` | Libellé lisible d'un couple catégorie / sous-catégorie |
| `normalizeLabel(s)` | Normalise un libellé pour le rapprochement (accents, casse, «…», parenthèses ignorés) |
| `catByLabel(s)`, `subByLabel(s)` | Retrouve une catégorie / sous-catégorie de la nomenclature à partir d'un libellé bancaire |
| `subByOperation(catId, opLabel)` | Déduit une sous-catégorie par inclusion de son libellé dans le libellé de l'opération bancaire |

`src/lib/import-csv.js` gère l'import de relevés bancaires :

| Fonction | Rôle |
|---|---|
| `parseFrDate(s)` | Date au format `JJ/MM/AAAA` |
| `parseFrAmount(s)` | Montant français (`-22,67` → `-22.67`) |
| `parseCsv(text)` | Découpe le CSV (`;`, BOM, CRLF) en lignes ; colonnes repérées par nom (date, catégorie, sous-catégorie, montant, « Libellé opération » optionnel : déduit la sous-catégorie si inconnue) |
| `rowsToEntries(rows, planned?)` | Convertit en écritures : débits → dépenses exceptionnelles, crédits → revenus uniques ; rapproche catégorie et sous-catégorie par libellé normalisé, ignore et signale les lignes invalides ; une ligne identique à une écriture planifiée (`planned = { expenses, incomes }`) est comptée dans `recurrentes` au lieu d'être importée |
| `matchesPlannedExpense`, `matchesPlannedIncome` | Rapprochement ligne / écriture planifiée (catégorie, sous-catégorie, montant ±0,01 €, fréquence) |

Le modèle de données est volontairement simple :

```js
{
  soldeDepart: 1500,
  expenses: [{ id, label, amount, day, cat, sub, freq, month?, incompressible? }], // récurrentes
  extras:    [{ id, label, amount, day, y, m, cat, sub, incompressible? }],        // exceptionnelles
  incomes:  [{ id, label, amount, mode: "fixe" | "salaire", day?,             // jour fixe si "fixe"
               treizieme?,   // true => ½ du salaire en plus en juin et novembre
               bonus?,       // montant versé avec le salaire de mars
               cat?, sub? }], // catégorie bancaire optionnelle (Revenus du travail, etc.)
  budgets:  { domestiques: 1000, habituelles: 500, sports: 50, loisirs: 120, voyages: 100, exceptionnelles: 300 }
}
```

## Tests

La suite couvre : années bissextiles, tri et signe des opérations, exclusion des dépenses annuelles hors de leur mois, clamp du jour
31, jours de paie (dont franchissement de week-end), 13ᵉ mois en juin/novembre, bonus de mars, dépenses exceptionnelles, revenus uniques (mode `unique`), enchaînement des soldes d'un mois à l'autre, détection de découvert, passage à l'année suivante, migration des anciennes sauvegardes (dont conversion des anciennes catégories plates), intégrité de la nomenclature bancaire, rattachement des enveloppes et agrégats incompressible/discrétionnaire ; parsing de l'import CSV (dates et montants français, BOM/CRLF, lignes invalides, rapprochement des libellés, conversion en écritures, déduction de sous-catégorie via « Libellé opération ») ; anti-doublons de l'import (dépenses récurrentes mensuelles/annuelles, consommation unique d'une écriture, revenus fixe/salaire/unique). **72 tests** au total.

```bash
npm test            # une seule exécution
npm run test:watch  # mode watch
```

Une GitHub Action (`.github/workflows/ci.yml`) exécute les tests à chaque push et pull request sur `main`. Une autre (`.github/workflows/tag-release.yml`) crée le tag `v{version}` à chaque push sur `main`.

## Suivi du projet

- Les évolutions sont documentées dans le [CHANGELOG.md](CHANGELOG.md)
- Convention : une entrée de changelog par version, format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)

## Stack

- [React 18](https://react.dev) — interface
- [Recharts](https://recharts.org) — graphiques
- [Tailwind CSS v4](https://tailwindcss.com) — style
- [Vite](https://vitejs.dev) — build et serveur de dev
- [Vitest](https://vitest.dev) — tests unitaires
