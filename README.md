# 💰 Budget prévisionnel — budget-perso

Application React de gestion de budget personnel qui répond à une question simple :
**« À quel moment du mois mes dépenses sont-elles débitées, et où va se retrouver mon solde en fin de mois ? »**

## Fonctionnalités

- **Nomenclature bancaire à 2 niveaux** : chaque dépense est classée par **catégorie** (Logement, Vie quotidienne, Loisirs, Voyages et Transports, Santé, Abonnements et téléphonie, Services financiers, Impôts et Taxes, Auto et Moto, Cadeaux et solidarité, Emprunts, Dépenses d'épargne, Frais professionnels, Virements, Retraits, Mouvements internes…) et **sous-catégorie** (issue du relevé bancaire)
- **Import de relevé bancaire CSV** 🧾 : fichier d'export `Date transaction;…;Catégorie;Sous-Catégorie;Montant;Pointée;` (colonne optionnelle `Libellé opération` : aide à déduire la sous-catégorie quand elle est inconnue ; l'intitulé des écritures reste le libellé simple) — les débits deviennent des dépenses exceptionnelles à leur date réelle, les crédits des revenus uniques, avec rapprochement automatique des catégories et récapitulatif avant import ; **anti-doublons** : une ligne correspondant à une écriture déjà planifiée (même catégorie/sous-catégorie, même montant à 0,01 € près, mois compatible) n'est pas importée en double
- **Historique enchaîné depuis le relevé** 🧾 : le solde de départ s'applique à la date chargée la plus lointaine du relevé ; les mois précédents forment un historique enchaîné (visible dans le sélecteur) et le mois courant s'ouvre sur le solde résultant
- **Sélecteur de mois filtrable** 🧾 : les mois chargés (dépense exceptionnelle ou revenu unique, typiquement importés d'un relevé) sont marqués 🧾 ; le filtre « Mois chargés » restreint la liste, et les mois chargés hors de la fenêtre de 12 mois y figurent aussi (annotés « hors fenêtre »)
- **Sous-catégories récurrentes identifiées** : dans les formulaires de dépense, les sous-catégories déjà couvertes par une dépense récurrente sont marquées « · récurrente » (🔒 si incompressible), avec avertissement détaillé
- **Console d'administration de la nomenclature** 🛠️ : onglet qui liste toutes les catégories et sous-catégories (avec nature et enveloppe), permet de **marquer chaque sous-catégorie récurrente 🔁 et/ou incompressible 🔒** en un clic, de **renommer** (✏️) et **d'activer/désactiver** (⏸️ / ▶️) chaque catégorie ou sous-catégorie sans perdre l'historique, et d'**ajouter un couple** catégorie · sous-catégorie (catégorie existante ou nouvelle) — la nomenclature est persistée avec l'état et utilisée partout (formulaires, import CSV, totaux du mois)
- **Dépenses récurrentes** : montant, jour de débit (1–31), catégorie bancaire, fréquence mensuelle ou annuelle
- **Dépenses exceptionnelles** : dépenses unitaires à date précise, catégorisées, intégrées à la simulation et au budget — *aucune écriture exceptionnelle n'existe par défaut* : seules les situations explicitement flaguées comme telles entrent dans la simulation
- **Modèle par récurrence** 🔁 : tout ce qui est mensuel ou annuel est forcément récurrent (prélèvement ou paiement régulier) ; les salaires sont récurrents, versés chaque mois selon la même règle, tout comme les revenus à jour fixe — seul le mode `unique` ne l'est pas ; les listes et infobulles marquent chaque opération 🔁 (récurrente) ou ✨ (exceptionnelle)
- **Point bas prévisionnel sur 12 mois** : le graphique des soldes fin de mois ajoute, en pointillés, le point bas de chaque mois — il suit les dates des prélèvements récurrents, stables d'un mois sur l'autre, et révèle les risques de découvert avant la fin du mois
- **Onglet « 📅 Échéancier »** : page dédiée — échéancier du mois sélectionné (chaque jour d'échéance, opérations récurrentes, net du jour et solde de fin de journée), calendrier type des couples marqués 🔁 à leurs dates habituelles, et table 12 mois (jours d'échéance, débits et crédits récurrents, point bas ⚠️ si négatif, solde en fin de mois). L'échéancier suit les marqueurs 🔁 de la nomenclature : marquer un couple dans « 🛠️ Admin » y fait apparaître (ou disparaître) ses écritures
- **Dépenses incompressibles** 🔒 : marqueur sur chaque dépense, visualisation incompressible vs discrétionnaire
- **6 enveloppes budgétaires** (Domestiques, Habituelles, Sports & autres, Loisirs, Voyages, Exceptionnelles) : chaque dépense est rangée automatiquement dans son enveloppe via sa catégorie bancaire ; l'onglet Budget affiche le détail des catégories qui alimentent chaque enveloppe
- **Revenus** :
  - à **jour fixe** du mois
  - ou type **« salaire »**, versé **l'avant-veille du dernier jour ouvré du mois** (calcul automatique, week-ends franchis)
  - option **13ᵉ mois en 2 fois** : ½ versée avec le salaire de juin, ½ avec celui de novembre
  - option **bonus estimé**, versé avec le salaire de mars
- **Aperçu du mois** : solde en début de mois, revenus, dépenses, **solde actuel** (à la date d'aujourd'hui) et solde prévisionnel de fin de mois
- **Solde de fin de mois probable** 📊 : au solde simulé s'ajoute une **provision pour habitudes non planifiées**, apprise des relevés importés — médiane des dépenses mensuelles par couple sur les 6 derniers mois complets, provisionnée si le couple est présent au moins un mois sur deux (une dépense exceptionnelle n'influence pas la prévision) ; restant du mois = tendance − déjà dépensé, réactualisé à chaque import. Détail par couple dans l'onglet « 📅 Échéancier » ; aucun revenu n'est estimé statistiquement
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
│       ├── estimation.js    # habitudes non planifiées : tendances et provision du solde probable
│       ├── budget.test.js  # tests unitaires Vitest de la logique métier
│       ├── import-csv.test.js  # tests unitaires Vitest de l'import CSV
│       └── estimation.test.js  # tests unitaires Vitest de l'estimation des habitudes
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
| `transactionsOfMonth(state, y, m)` | Opérations du mois : récurrentes + exceptionnelles + salaires (13ᵉ mois, bonus) ; chaque opération porte `rec` (récurrent) et `inc` (incompressible) |
| `isRecurringExpense(e, taxo?)` / `isRecurringIncome(i, taxo?)` | **Récurrence guidée par la nomenclature** : une écriture est récurrente si son motif l'est (mensuel/annuel, salaire ou jour fixe) ET si son couple catégorie / sous-catégorie est marqué « récurrente 🔁 » dans la nomenclature — ce sont les paramètres qui décident, comme pour l'incompressible ; seul le mode `unique` ne l'est jamais |
| `subRecurring(catId, subId, taxo?)` | Le couple est-il marqué « récurrente 🔁 » dans la nomenclature ? (helper de `taxonomie.js`) |
| `recurringSchedule(state, y, m)` | Échéancier récurrent du mois : opérations des couples 🔁 groupées par jour d'échéance, avec le net du jour — les dates stables d'un mois sur l'autre dessinent la trajectoire du solde |
| `recurringMonthTotals(state, y, m)` | Totaux récurrents d'un mois : jours d'échéance, opérations, débits, crédits, net (exceptionnels et uniques exclus) |
| `simulate(state, startY, startM, opening?)` | Simulation de 12 mois enchaînés : solde quotidien, point bas, totaux ; ouverture explicite possible (historique enchaîné en amont) |
| `simStart(state, defaultY, defaultM)` | Point d'ancrage de la simulation : le mois chargé le plus ancien s'il précède le mois courant |
| `monthSim(state, y, m, opening)` | Vue d'un mois isolé (même forme que `simulate()`) : mois chargé hors fenêtre, solde d'ouverture fourni |
| `loadedMonths(state)` | Mois « chargés » (dépense exceptionnelle ou revenu unique), triés, sans doublon |
| `addCategory(taxo, {label, nature, env})` / `addSubcategory(taxo, catId, {label, recurring, incompressible, nature})` / `setSubFlags(taxo, catId, subId, {recurring, incompressible})` | Console d'administration : ajout d'un couple et indicateurs 🔁 / 🔒 (fonctions pures, `taxonomie.js`) |
| `defaultTaxonomie()` / `slugify(label)` / `subIncompressible(catId, subId, taxo)` | Copie de la nomenclature par défaut, identifiant technique, indicateur incompressible |
| `TAXO_FLAGS_VERSION` / `applyDefaultFlags(taxo)` | Marqueurs 🔁/🔒 par défaut de la nomenclature de référence (fusion unique via `taxoFlagsVersion`) |
| `renameCategory` / `renameSubcategory` / `setCategoryActive` / `setSubActive` | Console d'administration : renommage et activation/désactivation (un élément désactivé disparaît des formulaires et de l'import CSV, l'existant reste compté) |
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
| `parseCsv(text)` | Découpe le CSV (`;`, BOM, CRLF) en lignes ; colonnes repérées par nom (date, catégorie, sous-catégorie, montant, « Libellé opération » optionnel : déduit la sous-catégorie si inconnue) ; les couples absents de la nomenclature sont conservés avec leurs libellés d'origine (seules date et montant illisibles sont ignorés) |
| `rowsToEntries(rows, planned?, taxo?)` | **Import guidé par la nomenclature** : un couple marqué 🔁 → des écritures récurrentes planifiées, une par **série temporelle** du couple (un montant qui varie d'un mois à l'autre reste la même série — une seule écriture au dernier montant observé ; deux prélèvements co-occurrents le même mois forment deux séries) ; sinon débits → dépenses exceptionnelles, crédits → revenus uniques ; les couples inconnus sont ajoutés dans la catégorie « À classer » (`taxoAdditions`) ; une ligne identique à une écriture planifiée est comptée dans `recurrentes` au lieu d'être importée ; une ligne 🔁 au montant inconnu est **rattachée** à l'écriture unique de son couple (`syncAmount` : son montant prévisionnel suit la dernière occurrence observée). **Historique réel** : chaque occurrence rapprochée est mémorisée avec sa date et son montant réels (`history` sur les écritures créées, `coveredHistory` pour les écritures existantes) |
| `mergeHistory(existing, obs)` | Fusionne deux historiques d'occurrences en dédoublonnant par date et montant (réimporter un même relevé n'ajoute rien), trié par date |
| `mergeAddedLines(existing, added)` | Déduplique par **multiset** les lignes ajoutées par un import (clé : date, couple, montant au centime, libellé) : réimporter un même relevé n'ajoute rien, les vrais doublons d'opérations restent distincts |
| `matchesPlannedExpense`, `matchesPlannedIncome` | Rapprochement ligne / écriture planifiée (catégorie, sous-catégorie, montant ±0,01 €, fréquence) |
| `applyTaxoAdditions(taxo, additions, choices?)` | Intègre les couples absents selon les choix du rapport d'import : catégorie d'accueil (défaut « À classer ») et renommage ; renvoie la nomenclature et le raccord des écritures vers leur nouvelle place |

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

## Habitudes non planifiées (`src/lib/estimation.js`)

Module **sans dépendance React** qui estime, à partir des dépenses importées non planifiées
(`extras`), ce qu'il reste à dépenser dans le mois pour les postes réels sans écriture :

| Fonction | Rôle |
|---|---|
| `medianOf(values)` | Médiane (moyenne des deux milieux si pair, 0 si vide) |
| `monthlySpendByCouple(extras)` | Totaux mensuels par couple « catégorie \| sous-catégorie » |
| `coupleTendencies(extras, upto?)` | Par couple : **tendance = médiane des totaux mensuels** sur une fenêtre d'au plus `TENDENCY_WINDOW` (6) mois complets avant `upto` (mois cible), zéros inclus, provisionnée seulement si présence ≥ `PRESENCE_MIN` (50 %) ; une dépense exceptionnelle retombe à 0 |
| `remainingProvision({ extras, expenses, y, m })` | Provision restante du mois : par couple sans écriture planifiée, `max(0, tendance − dépensé ce mois-ci)` ; aucun revenu estimé ; cold start → provision nulle |

Le KPI « Solde fin de mois probable » de l'Aperçu vaut `solde simulé − provision totale` ;
l'onglet « 📅 Échéancier » détaille chaque couple (tendance, dépensé, restant).

## Tests

La suite couvre : années bissextiles, tri et signe des opérations, exclusion des dépenses annuelles hors de leur mois, clamp du jour
31, jours de paie (dont franchissement de week-end), 13ᵉ mois en juin/novembre, bonus de mars, dépenses exceptionnelles, revenus uniques (mode `unique`), vue de mois isolé (`monthSim`), liste des mois chargés (`loadedMonths`), point d'ancrage de la simulation (`simStart`), enchaînement des soldes d'un mois à l'autre, détection de découvert, passage à l'année suivante, migration des anciennes sauvegardes (dont conversion des anciennes catégories plates), intégrité de la nomenclature bancaire, rattachement des enveloppes et agrégats incompressible/discrétionnaire ; parsing de l'import CSV (dates et montants français, BOM/CRLF, lignes invalides, rapprochement des libellés, conversion en écritures, déduction de sous-catégorie via « Libellé opération ») ; anti-doublons de l'import (dépenses récurrentes mensuelles/annuelles, consommation unique d'une écriture, revenus fixe/salaire/unique) ; **import guidé par la nomenclature** (lignes 🔁 → écritures récurrentes groupées en séries temporelles par couple, au dernier montant observé, crédits 🔁 → revenus fixes, couples inconnus conservés et ajoutés dans « À classer », rapport chargées / intégrées / ignorées) ; **rangement des couples depuis le rapport d'import** (renommage, catégorie d'accueil, rattachement aux couples existants, écritures suivant leur couple) ; modèle par récurrence guidé par la nomenclature (récurrence = motif mensuel/annuel **et** couple marqué 🔁 ; les écritures planifiées sur un couple non 🔁 restent budgétées mais sortent de l'échéancier récurrent, marquer 🔁 dans la console les y fait entrer), marqueur `rec` de chaque opération, échéancier par jour, totaux récurrents mensuels, aucun exceptionnel par défaut. **168 tests** au total, dont l'historique réel des occurrences 🔁 (stockage, fusion sans doublon au réimport), les séries temporelles des couples 🔁 (montant variable sans écriture en double, rattachement et synchronisation du montant prévisionnel), le **dédoublonnage multiset au réimport** (extras, revenus uniques, séries 🔁 rattachées à l'écriture couvrante) et l'**estimation des habitudes non planifiées** (médiane avec zéros, seuil de présence, fenêtre de 6 mois, provision restante, exclusion des couples planifiés, cold start).

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
