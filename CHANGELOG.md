# Changelog

Toutes les évolutions notables de ce projet seront documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit les principes du [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Idées / backlog

- Historique réel vs prévisionnel
- Alertes d'échéance (notifications en amont des gros débits)
- Réglages par couple du modèle prédictif (fenêtre / statistique individuelles) — en réserve : voir comment le réglage global évolue déjà à l'usage

## [0.24.0] — 2026-10-05

### Ajouté

- **Transferts internes ⇄ (virements d'épargne)** : les couples « Dépenses d'épargne / Épargne bancaire (Livret A, PEL…) » et « Revenus d'épargne / Revenus d'épargne - Autres » sont marqués « transfert interne » (marqueur ⇄, éditable par couple dans la console 🛠️ Admin comme 🔁 et 🔒). Leurs mouvements comptent toujours dans le **solde** (exact au centime) mais **plus dans les totaux budgétaires** : un versement de 3 000 € vers un livret n'est plus une « dépense », un retrait n'est plus un « revenu » — le budget reflète le train de vie réel. `monthlyExpenses` expose le total `transfers`.
- **KPI « Flux épargne net »** (Aperçu) : versements − retraits du mois affiché, avec alerte ⚠️ quand il est négatif (« réserve sollicitée ») — le signal d'objectif : vivre du budget courant sans puiser dans l'épargne.
- **Simulation** : chaque mois expose `transferIn` / `transferOut` / `fluxEpargne` (simulation et mois chargés réels) ; les KPI « Revenus du mois » et « Dépenses du mois » sont désormais hors transferts internes.
- **Heuristique d'import** : une ligne dont le couple est inconnu mais dont le libellé opération évoque un livret (`Livret A`, `CSL`, `Compte sur Livret`, `PEL`, `LDD` — `EPARGNE_LABEL_RE`) est rangée sur le couple transfert correspondant (versement si débit, retrait si crédit) ; un couple déjà catégorisé par la banque n'est jamais réécrit.
- `remainingProvision` accepte la nomenclature (`taxo`) et **exclut les couples ⇄** de l'apprentissage des habitudes comme du déjà-dépensé.

### Modifié

- `TAXO_FLAGS_VERSION` passe à 2 : `migrateState` re-applique les marqueurs ⇄ sur les états existants (aucun autre changement de schéma).

## [0.23.0] — 2026-10-05

### Ajouté

- **Chaînage réel des mois chargés (🧾)** : les mois de l'historique disposant de données importées affichent désormais les **flux réels du relevé** (occurrences d'historique des écritures planifiées à date et montant observés, dépenses exceptionnelles, revenus uniques) — les récurrentes planifiées n'y sont plus re-simulées. Les mois sans données restent simulés par les écritures planifiées, et l'enchaînement de solde se fait de mois chargé en mois chargé.
- **« Solde de départ » = balance à la date chargée la plus lointaine** : la case consigne la balance à la première date du relevé (plus un solde par mois) ; l'ajout des lignes réellement chargées restitue le solde actuel **au centime**. Le mois courant chargé affiche le réel jusqu'à aujourd'hui (`realSoFar`) puis les écritures planifiées sans occurrence en prévision pour la fin du mois ; le KPI « Solde actuel » vaut alors ancre + cumul réel, exact au centime.
- Nouvelles fonctions dans `src/lib/budget.js` : `hasRealData`, `loadedMonths`, `realTransactionsOfMonth`, `realMonthSim` (partage du cœur `buildMonth` avec `monthSim`).

### Corrigé

- Le mois affiché par défaut après import est désormais le **mois courant** (et non le premier mois de l'historique).

## [0.22.0] — 2026-10-03

### Ajouté

- **Réglages du modèle prédictif dans la console 🛠️ Admin** : la carte « Modèle prédictif — habitudes non planifiées » expose les trois curseurs de la provision — **fenêtre d'apprentissage** (1 à 24 mois complets, 6 par défaut), **présence minimale** (0 à 100 %, 50 % par défaut) et **statistique de tendance** (médiane, peu sensible aux extrêmes, ou moyenne, qui suit les gros mois). La provision recalculée s'affiche en direct dans la console pour le mois affiché, et les réglages sont persistés avec l'état (`state.estimation`, normalisés par `normEstimation` avec bornes sûres au chargement) : ils survivent à un rechargement et s'appliquent au KPI « Solde fin de mois probable » comme à la carte « Habitudes non planifiées » de l'onglet Échéancier.


### Ajouté

- **Solde de fin de mois probable** : nouveau KPI de l'Aperçu qui retranche du solde simulé une **provision pour habitudes non planifiées**, apprise des relevés importés. Le moteur (`src/lib/estimation.js`) calcule pour chaque couple catégorie / sous-catégorie sans écriture planifiée la **tendance = médiane des totaux mensuels** sur une fenêtre d'au plus 6 mois complets (mois sans dépense comptés zéro), provisionnée seulement si le couple est présent dans au moins 50 % des mois de la fenêtre — une dépense exceptionnelle n'influence pas la prévision. La **provision restante** du mois vaut `max(0, tendance − déjà dépensé ce mois-ci)` : lissée sur les jours restants, elle se réactualise à chaque import. Aucun revenu n'est estimé statistiquement ; les couples portés par une écriture planifiée sont exclus (pas de double comptage) ; sans relevé importé, la provision est nulle.
- **Onglet « 📅 Échéancier » — carte « Habitudes non planifiées — provision restante »** : par couple, la tendance, le déjà-dépensé et le restant provisionné du mois affiché, avec le total et le lissage sur les jours restants du mois en cours.

### Corrigé

- **Réimport d'un relevé** : les dépenses exceptionnelles et revenus uniques sont dédoublonnés par multiset (`mergeAddedLines` — date, couple, montant au centime, libellé ; les vrais doublons d'opérations restent distincts), et une série 🔁 dont tous les mois sont déjà dans l'historique d'une écriture est **rattachée à cette écriture** au lieu d'en créer une nouvelle : réimporter un même relevé ne change plus rien (idempotence), y compris pour les couples découpés en plusieurs séries.

## [0.20.0] — 2026-10-03

### Corrigé

- **Un couple 🔁 dont le montant évolue ne crée plus une écriture par montant** (salaire qui change, facture qui varie) : chaque montant donnait une écriture récurrente, toutes comptées chaque mois — trois salaires simulés au lieu d'un. Les lignes 🔁 d'un couple sont désormais découpées en **séries temporelles** : un montant qui varie d'un mois à l'autre reste dans la même série (une seule écriture, au **dernier montant observé**, toutes les occurrences conservées dans son historique) ; deux prélèvements distincts d'un même couple co-occurrent le même mois et forment deux séries (deux écritures).

### Ajouté

- **Rattachement au montant nouveau** : une ligne 🔁 dont le montant ne correspond à aucune écriture planifiée est rattachée à l'écriture unique de son couple (si elle n'a pas déjà été payée ce mois-là) au lieu d'en créer une nouvelle. L'occurrence alimente son historique et son montant prévisionnel suit la dernière occurrence observée (`syncAmount` sur `coveredHistory`) : un salaire réel met à jour l'écriture « Salaire » existante. En cas d'ambiguïté (plusieurs écritures sur le couple), la ligne reste une écriture séparée.
- Le dialogue d'import mentionne la synchronisation du montant prévisionnel des écritures 🔁 rattachées.

## [0.19.0] — 2026-10-03

### Ajouté

- **Historique réel des occurrences 🔁** : à l'import CSV, chaque ligne rapprochée d'un couple marqué récurrent est mémorisée avec sa **date réelle et son montant observé**. Les écritures récurrentes créées portent un champ `history` ; les lignes couvertes par une écriture déjà planifiée alimentent `coveredHistory`, fusionné dans l'écriture existante au moment de la confirmation. Aucun nouvel affichage : l'historique est stocké (persistance automatique via la migration d'état) en vue du futur suivi « réel vs prévisionnel ».
- Nouvelle fonction `mergeHistory(existing, obs)` dans `import-csv.js` : fusionne les historiques en dédoublonnant par date et montant — réimporter un même relevé n'ajoute aucune occurrence — et trie par date.
- Le dialogue d'import mentionne la capture de l'historique (dates réelles, montants observés, aucun doublon au réimport).

### Corrigé

- Console 🛠️ Admin : les boutons « Désactiver / Réactiver » des catégories et sous-catégories étaient inversés — un clic sur « Désactiver » ne changeait rien. L'état visé est désormais calculé à partir de l'état courant (`active === false` → on réactive, sinon on désactive).

## [0.18.0] — 2026-10-03

### Ajouté

- **Échéancier récurrent guidé par la nomenclature** : seuls les couples marqués « récurrente 🔁 » y figurent — une écriture planifiée sur un couple non 🔁 n'est pas un prélèvement ou un abonnement régulier et n'apparaît ni dans l'échéancier du mois, ni dans le calendrier type, ni dans la table 12 mois. Marquer 🔁 une sous-catégorie dans la console 🛠️ Admin y fait immédiatement apparaître toutes ses écritures (et le dé-marquer les en fait sortir).
- Nouvelle fonction `subRecurring(catId, subId, taxo?)` dans `taxonomie.js` : le couple est-il marqué 🔁 dans la nomenclature ?

### Modifié

- `isRecurringExpense(e, taxo?)` et `isRecurringIncome(i, taxo?)` prennent la nomenclature en paramètre : la récurrence exige désormais le motif (mensuel/annuel, salaire ou jour fixe) **et** le marqueur 🔁 du couple — les paramètres de la nomenclature décident, comme pour l'incompressible.
- Le marqueur `rec` des opérations du mois suit le 🔁 du couple : une écriture mensuelle sur un couple non 🔁 reste planifiée et comptée dans le budget et la simulation (elle n'est pas perdue), mais porte ✨ au lieu de 🔁.
- L'onglet Dépenses liste « Dépenses planifiées » avec un badge 🔁 ou « ✨ Non récurrent » par écriture ; l'onglet Revenus distingue 🔁, « ✨ Unique » et « ✨ Non récurrent ».
- `import-csv.js` réutilise `subRecurring` (plus de helper local).

## [0.17.0] — 2026-10-03

### Ajouté

- **Rangement des couples « À classer » depuis le rapport d'import** : le rapport d'import CSV devient un vrai dialogue (plus de fenêtre `confirm`) ; chaque couple absent de la nomenclature y est présenté avec :
  - un champ **libellé** (renommage avant intégration) ;
  - un sélecteur de **catégorie d'accueil** (défaut « À classer », ou n'importe quelle catégorie de sa nature, dépense ou revenu) ;
  - les écritures importées qui référencent le couple suivent automatiquement leur nouvelle place ;
  - un couple déjà existant dans la catégorie cible sous le même libellé n'est pas recréé : les écritures s'y rattachent.
- Nouvelle fonction pure `applyTaxoAdditions(taxo, additions, choices?)` dans `import-csv.js` : intègre les couples selon les choix (`{ cat, label }` par couple) et renvoie la nomenclature mise à jour avec le raccord `mapping` des écritures.

### Modifié

- `importCsvFile` ouvre le dialogue au lieu de `window.confirm` ; la confirmation (`confirmCsvImport`) applique le rapport complet — écritures récurrentes, exceptionnelles, revenus — avec les couples rangés.

## [0.16.0] — 2026-10-03

### Ajouté

- **Import CSV guidé par la nomenclature** : ce sont les couples catégorie / sous-catégorie du relevé qui pilotent l'intégration, et leurs paramètres qui décident —
  - une ligne dont le couple est marqué « récurrente 🔁 » devient une **écriture récurrente planifiée** (dépense mensuelle ou revenu en mode fixe), une seule par couple et montant, au jour le plus fréquent du relevé ; le marqueur « incompressible 🔒 » est repris de la nomenclature ; les lignes ainsi couvertes ne sont pas importées en double ;
  - plusieurs montants pour un même couple 🔁 → une écriture chacun, avec le montant en suffixe du libellé ;
  - crédits 🔁 → **revenus récurrents** (mode fixe), plus d'exceptionnels par défaut à l'import.
- **Catégorie « À classer »** : tout couple catégorie / sous-catégorie absent de la nomenclature (catégorie inconnue ou sous-catégorie introuvable) est conservé et ajouté dans « À classer » à la confirmation — rien n'est ignoré, la nature (dépense / revenu) est déduite du signe du montant.
- **Rapport d'import** : lignes chargées / intégrées / ignorées, avec le détail des écritures récurrentes créées, des dépenses exceptionnelles, des revenus uniques, des lignes déjà couvertes et des couples ajoutés dans « À classer ».

### Modifié

- `parseCsv` ne rejette plus les catégories inconnues : la ligne est conservée avec ses libellés d'origine (`catLabel` / `subLabel`) ; seules les dates et montants illisibles (ou nuls) sont ignorés.
- `rowsToEntries(rows, planned, taxo)` prend la nomenclature en troisième paramètre et retourne `newExpenses` / `newIncomes` (écritures planifiées créées), `taxoAdditions` (couples à ajouter), `couvertesOut` / `couvertesIn` (lignes couvertes) en plus des sorties historiques.

## [0.15.0] — 2026-10-03

### Ajouté

- **Onglet dédié « 📅 Échéancier »** (entre « Budget par catégorie » et « Admin »), en complément d'« Aperçu », « Dépenses », « Revenus »… :
  - échéancier du mois sélectionné : chaque jour d'échéance avec ses opérations récurrentes (🔒 si incompressible), le net du jour et **le solde de fin de journée** dans la simulation ;
  - **calendrier type des récurrents** : paiements et revenus récurrents du budget à leurs dates habituelles (jour fixe, chaque mois, chaque « mois d'une annuelle », salaire versé l'avant-veille du dernier jour ouvré) ;
  - **table 12 mois** : pour chaque mois simulé, jours d'échéance, débits 🔁 et crédits 🔁, point bas de la trajectoire (⚠️ si négatif) et solde en fin de mois ; le mois sélectionné est surligné.

### Modifié

- La carte « Échéancier récurrent » de l'aperçu est déplacée vers cet onglet (l'aperçu garde le graphique 12 mois avec point bas).
- Nouvelle fonction `recurringMonthTotals(state, y, m)` dans `budget.js` : totaux récurrents d'un mois (jours d'échéance, opérations, débits, crédits, net), exceptionnels et uniques exclus.

## [0.14.0] — 2026-10-03

### Ajouté

- **Modèle par récurrence** : le moteur raisonne en récurrence, plus en `freq`.
  - nouvelles fonctions `isRecurringExpense` (tout mensuel ou annuel est forcément récurrent) et `isRecurringIncome` (salaires versés chaque mois selon la même règle + revenus à jour fixe = récurrents ; seul le mode `unique` ne l'est pas) ;
  - chaque opération du mois porte désormais `rec` (récurrent) en plus de `inc` (incompressible) : les marqueurs 🔁 (récurrent) / ✨ (exceptionnel) apparaissent dans les listes et les infobulles.
- **Graphique 12 mois : point bas de chaque mois** (ligne pointillée ambre) — les dates des prélèvements récurrents étant stables d'un mois sur l'autre, le point bas est prévisible et affine la lecture des soldes fin de mois à venir ; l'infobulle affiche « fin de mois » et « point bas ».
- **Échéancier récurrent** dans l'aperçu : les paiements récurrents du mois affiché, groupés par jour d'échéance avec le net du jour (nouvelle fonction `recurringSchedule`).

### Modifié

- **Plus aucune écriture exceptionnelle par défaut** : l'état initial ne contient ni dépense exceptionnelle ni revenu unique — seules les situations explicitement flaguées comme telles entrent dans la simulation (l'exemple « Réparation voiture » est retiré de la démonstration).
- `transactionsOfMonth` ne planifie plus une dépense non récurrente (hors modèle) ; le motif `freq` (mensuelle/annuelle) décrit la récurrence, il ne définit plus l'exceptionnel.

## [0.13.0] — 2026-10-03

### Ajouté

- **Marqueurs 🔁/🔒 par défaut sur la nomenclature de référence** : 15 sous-catégories typiques sont pré-marquées —
  - récurrentes **et** incompressibles : Loyers et charges, Emprunt immobilier, Assurance habitation, Énergie, Alimentation, Transports quotidiens, Complémentaires santé, Frais bancaires, Impôts et Taxes, Crédit conso
  - récurrentes seulement : Téléphonie, Multimédia à domicile, Carburant, Épargne bancaire, Salaire fixe
- Application **une seule fois par fusion** (`applyDefaultFlags`, version `taxoFlagsVersion` enregistrée dans l'état) : les marqueurs déjà posés par l'utilisateur ne sont jamais retirés, les éléments personnalisés ne sont pas touchés, et les choix faits ensuite dans la console d'administration ne sont plus écrasés
- Nouvelles fonctions dans `taxonomie.js` : `TAXO_FLAGS_VERSION`, `applyDefaultFlags`

### Modifié

- Les totaux du mois (incompressible vs discrétionnaire) prennent désormais en compte les marqueurs par défaut : une nouvelle dépense récurrente « Courses » sur *Alimentation* est comptée incompressible sans action de l'utilisateur

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
