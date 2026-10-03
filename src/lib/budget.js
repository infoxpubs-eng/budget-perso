/**
 * budget.js — Logique métier pure de "Budget prévisionnel".
 *
 * Aucune dépendance React : ce module est testable isolément (voir budget.test.js).
 * Toutes les fonctions sont déterministes à partir des données passées en entrée.
 */

export const ENVELOPPES = [
  { id: "domestiques", label: "Domestiques", color: "#6366f1" },
  { id: "habituelles", label: "Habituelles", color: "#14b8a6" },
  { id: "sports", label: "Sports & autres", color: "#f59e0b" },
  { id: "loisirs", label: "Loisirs", color: "#ec4899" },
  { id: "voyages", label: "Voyages", color: "#0ea5e9" },
  { id: "exceptionnelles", label: "Exceptionnelles", color: "#8b5cf6" },
];

import {
  defaultTaxonomie,
  envelopeOf,
  subIncompressible,
  taxCat,
  TAXO_FLAGS_VERSION,
  applyDefaultFlags,
} from "./taxonomie.js";

/**
 * Correspondance entre les anciennes catégories plates (≤ v0.2.x) et la
 * nomenclature bancaire à 2 niveaux (v0.3+), utilisée par migrateState.
 */
export const LEGACY_CATS = {
  domestiques: { cat: "logement", sub: "loyers-charges" },
  habituelles: { cat: "vie-quotidienne", sub: "alimentation" },
  sports: { cat: "loisirs", sub: "club" },
  loisirs: { cat: "loisirs", sub: "restaurants" },
  voyages: { cat: "voyages-transports", sub: "longue-distance" },
  exceptionnelles: { cat: "logement", sub: "frais-exceptionnels" },
};

export const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/** Formate un montant en euros (fr-FR). */
export function fmt(n) {
  return eur.format(n);
}

/** Nombre de jours d'un mois. `m` est indexé 0 (janvier = 0), comme Date. */
export function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

/** Libellé lisible d'un mois, ex. "Mars 2026". */
export function monthLabel(y, m) {
  return MONTHS[m] + " " + y;
}

/** Indique si une écriture (freq + mois éventuel) tombe dans le mois `m` (indexé 0). */
export function freqInMonth(freq, month, m) {
  return freq === "mensuelle" || (month ?? 1) - 1 === m;
}

/* ------------------------------------------------------------------ */
/* Jours ouvrés                                                       */
/* ------------------------------------------------------------------ */

/** Samedi/dimanche exclus. */
export function isBusinessDay(date) {
  const w = date.getDay();
  return w !== 0 && w !== 6;
}

/** Dernier jour ouvré d'un mois (semaine de 5 jours, hors jours fériés). */
export function lastBusinessDay(y, m) {
  const d = new Date(y, m + 1, 0);
  while (!isBusinessDay(d)) d.setDate(d.getDate() - 1);
  return new Date(d);
}

/**
 * Jour de versement d'un salaire : l'avant-veille du dernier jour ouvré du mois,
 * c'est-à-dire 2 jours ouvrés avant le dernier jour ouvré (week-ends franchis).
 */
export function salaryPayDay(y, m) {
  const d = lastBusinessDay(y, m);
  let back = 0;
  while (back < 2) {
    d.setDate(d.getDate() - 1);
    if (isBusinessDay(d)) back++;
  }
  return d.getDate();
}

/* ------------------------------------------------------------------ */
/* Migration / normalisation de l'état sauvegardé                     */
/* ------------------------------------------------------------------ */

/**
 * Traduit une ancienne catégorie plate (≤ v0.2.x) en couple (catégorie,
 * sous-catégorie) de la nomenclature bancaire. Les entrées déjà migrées
 * ou inconnues sont renvoyées inchangées.
 */
function migrateCat(entry) {
  const legacy = LEGACY_CATS[entry.cat];
  if (!legacy) return entry;
  return { ...entry, cat: legacy.cat, sub: entry.sub ?? legacy.sub };
}

/**
 * Normalise la nomenclature personnalisée d'un état sauvegardé : champs
 * manquants complétés, indicateurs « récurrente » / « incompressible »
 * ramenés à des booléens. Retourne la nomenclature par défaut si absente
 * ou structure invalide.
 */
function normalizeTaxonomie(taxo) {
  const valid =
    Array.isArray(taxo) &&
    taxo.length > 0 &&
    taxo.every((c) => c && c.id && typeof c.label === "string" && Array.isArray(c.subs));
  if (!valid) taxo = defaultTaxonomie();
  return taxo.map((c) => ({
    nature: "depense",
    env: "sports",
    ...c,
    active: c.active !== false,
    subs: (c.subs ?? []).map((sub) => ({
      ...sub,
      recurring: !!sub.recurring,
      incompressible: !!sub.incompressible,
      active: sub.active !== false,
    })),
  }));
}

/**
 * Complète un état (chargé du localStorage ou importé) avec les valeurs par
 * défaut des champs ajoutés au fil des versions, sans perdre les données.
 * Les anciennes catégories plates sont converties vers la nomenclature
 * bancaire à 2 niveaux (voir LEGACY_CATS).
 */
export function migrateState(raw) {
  const s = {
    soldeDepart: 1500,
    expenses: [],
    incomes: [],
    extras: [],
    budgets: { domestiques: 0, habituelles: 0, sports: 0, loisirs: 0, voyages: 0, exceptionnelles: 0 },
    ...(raw ?? {}),
  };
  s.expenses = (s.expenses ?? []).map((e) => migrateCat({ incompressible: false, freq: "mensuelle", ...e }));
  s.extras = (s.extras ?? []).map((x) =>
    migrateCat({ cat: "exceptionnelles", incompressible: false, ...x })
  );
  s.incomes = (s.incomes ?? []).map((i) => ({
    mode: i.mode ?? (i.day ? "fixe" : "salaire"),
    treizieme: false,
    bonus: 0,
    cat: "revenus-travail",
    sub: "salaire-fixe",
    ...i,
  }));
  s.taxonomie = normalizeTaxonomie(s.taxonomie);
  // Marqueurs 🔁/🔒 par défaut : appliqués une seule fois (fusion), puis la
  // version est enregistrée pour ne plus écraser les choix de l'utilisateur.
  if (s.taxoFlagsVersion !== TAXO_FLAGS_VERSION) {
    s.taxonomie = applyDefaultFlags(s.taxonomie);
    s.taxoFlagsVersion = TAXO_FLAGS_VERSION;
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Opérations d'un mois                                                */
/* ------------------------------------------------------------------ */

/**
 * Liste des opérations d'un mois donné, triées par jour.
 * - dépenses récurrentes (mensuelles ou annuelles, jour ramené à la fin des mois courts)
 * - dépenses exceptionnelles (date précise {y, m, day})
 * - revenus à jour fixe
 * - revenus type "salaire" : versés l'avant-veille du dernier jour ouvré,
 *   avec en option la ½ du 13ᵉ mois en juin et novembre, et un bonus estimé en mars.
 *
 * @returns {Array<{day:number,label:string,amount:number,type:"in"|"out",cat:string,sub?:string,inc:boolean}>}
 */
export function transactionsOfMonth(state, y, m) {
  const tx = [];
  const dim = daysInMonth(y, m);

  for (const e of state.expenses) {
    if (e.freq === "annuelle" && (e.month ?? 1) - 1 !== m) continue;
    tx.push({
      day: Math.min(e.day, dim),
      label: e.label,
      amount: -e.amount,
      type: "out",
      cat: e.cat,
      sub: e.sub,
      inc: !!e.incompressible || subIncompressible(e.cat, e.sub, state.taxonomie),
    });
  }

  for (const x of state.extras ?? []) {
    if (x.y !== y || x.m !== m) continue;
    tx.push({
      day: Math.min(x.day, dim),
      label: x.label,
      amount: -x.amount,
      type: "out",
      cat: x.cat ?? "logement",
      sub: x.sub ?? "frais-exceptionnels",
      inc: !!x.incompressible || subIncompressible(x.cat, x.sub, state.taxonomie),
    });
  }

  for (const i of state.incomes) {
    if (i.mode === "unique") {
      if (i.y !== y || i.m !== m) continue;
      tx.push({
        day: Math.min(i.day, dim),
        label: i.label,
        amount: i.amount,
        type: "in",
        cat: i.cat ?? "revenus-travail",
        sub: i.sub,
        inc: false,
      });
    } else if (i.mode === "salaire") {
      const day = salaryPayDay(y, m);
      tx.push({ day, label: i.label, amount: i.amount, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false });
      if (i.treizieme && (m === 5 || m === 10)) {
        tx.push({ day, label: i.label + " · 13ᵉ mois (½)", amount: i.amount / 2, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false });
      }
      if ((i.bonus ?? 0) > 0 && m === 2) {
        tx.push({ day, label: i.label + " · bonus estimé", amount: i.bonus, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false });
      }
    } else {
      tx.push({
        day: Math.min(i.day, dim),
        label: i.label,
        amount: i.amount,
        type: "in",
        cat: i.cat ?? "revenus-travail",
        sub: i.sub ?? "salaire-fixe",
        inc: false,
      });
    }
  }

  tx.sort((a, b) => a.day - b.day);
  return tx;
}

/* ------------------------------------------------------------------ */
/* Simulation 12 mois                                                  */
/* ------------------------------------------------------------------ */

/**
 * Simule 12 mois consécutifs à partir de (startY, startM) et du solde de départ.
 * Chaque mois démarre avec le solde de fin du mois précédent (report prévisionnel).
 *
 * @returns {Array<MonthSim>}
 * @typedef {Object} MonthSim
 * @property {number} y
 * @property {number} m
 * @property {string} label
 * @property {number} start      solde en début de mois
 * @property {number} end        solde en fin de mois
 * @property {number} min        point le plus bas du mois
 * @property {number} minDay     jour du point le plus bas
 * @property {number} totalIn    total des entrées du mois
 * @property {number} totalOut   total des sorties du mois
 * @property {Array}  tx         opérations du mois (triées par jour)
 * @property {Array}  daily      série quotidienne : { day, solde, date, events }
 */
/**
 * Vue d'un mois isolé — même forme qu'un élément de simulate(). Le solde
 * d'ouverture est fourni : chaîné par simulate() d'un mois sur l'autre, ou
 * solde de départ pour un mois affiché seul (ex. mois chargé hors de la
 * fenêtre de 12 mois).
 */
export function monthSim(state, y, m, opening) {
  const dim = daysInMonth(y, m);
  const tx = transactionsOfMonth(state, y, m);
  const daily = [];
  let bal = opening;
  let totalIn = 0;
  let totalOut = 0;
  let min = opening;
  let minDay = 0;
  daily.push({ day: 0, solde: bal, date: "1er " + MONTHS[m], events: [] });
  for (let day = 1; day <= dim; day++) {
    const events = tx.filter((t) => t.day === day);
    for (const e of events) {
      bal += e.amount;
      if (e.type === "in") totalIn += e.amount;
      else totalOut += -e.amount;
    }
    daily.push({ day, solde: bal, date: day + " " + MONTHS[m], events });
    if (bal < min) {
      min = bal;
      minDay = day;
    }
  }
  return {
    y,
    m,
    label: monthLabel(y, m),
    start: opening,
    end: bal,
    min,
    minDay,
    totalIn,
    totalOut,
    tx,
    daily,
  };
}

/**
 * Mois « chargés » : ceux qui contiennent au moins une dépense
 * exceptionnelle ou un revenu unique (données typiquement importées d'un
 * relevé CSV). Liste triée du plus ancien au plus récent, sans doublon.
 */
export function loadedMonths(state) {
  const byKey = new Map();
  const add = (y, m) => {
    if (y !== undefined && m !== undefined) byKey.set(y + "-" + m, { y, m });
  };
  for (const x of state.extras ?? []) add(x.y, x.m);
  for (const i of state.incomes ?? []) if (i.mode === "unique") add(i.y, i.m);
  return [...byKey.values()].sort((a, b) => a.y - b.y || a.m - b.m);
}

/**
 * Point d'ancrage de la simulation : le mois chargé le plus ancien s'il
 * précède le mois de départ par défaut (mois courant) — le solde de départ
 * s'applique à ce mois-là et l'historique enchaîne les mois jusqu'au mois
 * courant. Sans mois chargé antérieur, renvoie le mois de départ par défaut.
 */
export function simStart(state, defaultY, defaultM) {
  const loaded = loadedMonths(state);
  for (const d of loaded) {
    if (d.y < defaultY || (d.y === defaultY && d.m < defaultM)) return { y: d.y, m: d.m };
  }
  return { y: defaultY, m: defaultM };
}

/**
 * Simulation de 12 mois enchaînés à partir du mois de départ. Chaque mois
 * est produit par monthSim() ; le solde de fin d'un mois ouvre le suivant.
 * `opening` (facultatif) remplace le solde de départ comme ouverture du
 * premier mois — utilisé pour enchaîner un historique calculé en amont.
 */
export function simulate(state, startY, startM, opening = state.soldeDepart) {
  const out = [];
  let carry = opening;
  for (let k = 0; k < 12; k++) {
    const d = new Date(startY, startM + k, 1);
    const month = monthSim(state, d.getFullYear(), d.getMonth(), carry);
    out.push(month);
    carry = month.end;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Agrégats budgétaires d'un mois                                      */
/* ------------------------------------------------------------------ */

/**
 * Total des dépenses planifiées du mois (indexé 0), toutes natures confondues.
 *
 * - `byEnv` / `incByEnv` : totaux par enveloppe budgétaire (les 6 historiques).
 *   Les dépenses récurrentes sont rangées via la nomenclature bancaire
 *   (voir taxonomie.js → envelopeOf), les dépenses exceptionnelles comptent
 *   toujours dans l'enveloppe « Exceptionnelles ».
 * - `byCat` / `incByCat` : totaux par grande catégorie bancaire, toutes
 *   enveloppes confondues (utile pour le détail par catégorie).
 *
 * @returns {{byEnv: Record<string,number>, incByEnv: Record<string,number>,
 *            byCat: Record<string,number>, incByCat: Record<string,number>,
 *            detail: Record<string,number>,
 *            incompressible: number, discretionnaire: number, total: number}}
 */
export function monthlyExpenses(state, y, m) {
  const taxo = state.taxonomie;
  const byEnv = {};
  const incByEnv = {};
  for (const e of ENVELOPPES) {
    byEnv[e.id] = 0;
    incByEnv[e.id] = 0;
  }
  const byCat = {};
  const incByCat = {};
  const detail = {};
  let incompressible = 0;
  let total = 0;

  const add = (env, cat, amount, inc, sub) => {
    if (byEnv[env] === undefined) env = "exceptionnelles";
    const c = taxCat(cat, taxo) ? cat : "logement";
    byEnv[env] += amount;
    incByEnv[env] += inc ? amount : 0;
    byCat[c] = (byCat[c] ?? 0) + amount;
    incByCat[c] = (incByCat[c] ?? 0) + (inc ? amount : 0);
    const k = env + "|" + c + "|" + (sub ?? "");
    detail[k] = (detail[k] ?? 0) + amount;
    if (inc) incompressible += amount;
    total += amount;
  };

  for (const e of state.expenses) {
    if (freqInMonth(e.freq, e.month, m)) {
      add(
        envelopeOf(e.cat, e.sub, taxo),
        e.cat,
        e.amount,
        !!e.incompressible || subIncompressible(e.cat, e.sub, taxo),
        e.sub
      );
    }
  }
  for (const x of state.extras ?? []) {
    if (x.y === y && x.m === m) {
      add(
        "exceptionnelles",
        x.cat ?? "logement",
        x.amount,
        !!x.incompressible || subIncompressible(x.cat, x.sub, taxo),
        x.sub ?? "frais-exceptionnels"
      );
    }
  }

  return { byEnv, incByEnv, byCat, incByCat, detail, incompressible, discretionnaire: total - incompressible, total };
}
