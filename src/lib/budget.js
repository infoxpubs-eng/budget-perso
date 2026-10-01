/**
 * budget.js — Logique métier pure de "Budget prévisionnel".
 *
 * Aucune dépendance React : ce module est testable isolément (voir budget.test.js).
 * Toutes les fonctions sont déterministes à partir des données passées en entrée.
 */

export const CATS = [
  { id: "domestiques", label: "Domestiques", color: "#6366f1" },
  { id: "habituelles", label: "Habituelles", color: "#14b8a6" },
  { id: "sports", label: "Sports & autres", color: "#f59e0b" },
  { id: "loisirs", label: "Loisirs", color: "#ec4899" },
  { id: "voyages", label: "Voyages", color: "#0ea5e9" },
  { id: "exceptionnelles", label: "Exceptionnelles", color: "#8b5cf6" },
];

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
 * Complète un état (chargé du localStorage ou importé) avec les valeurs par
 * défaut des champs ajoutés au fil des versions, sans perdre les données.
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
  s.expenses = (s.expenses ?? []).map((e) => ({ incompressible: false, freq: "mensuelle", ...e }));
  s.extras = (s.extras ?? []).map((x) => ({
    cat: "exceptionnelles",
    incompressible: false,
    ...x,
  }));
  s.incomes = (s.incomes ?? []).map((i) => ({
    mode: i.mode ?? (i.day ? "fixe" : "salaire"),
    treizieme: false,
    bonus: 0,
    ...i,
  }));
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
 * @returns {Array<{day:number,label:string,amount:number,type:"in"|"out",cat:string,inc:boolean}>}
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
      inc: !!e.incompressible,
    });
  }

  for (const x of state.extras ?? []) {
    if (x.y !== y || x.m !== m) continue;
    tx.push({
      day: Math.min(x.day, dim),
      label: x.label,
      amount: -x.amount,
      type: "out",
      cat: x.cat ?? "exceptionnelles",
      inc: !!x.incompressible,
    });
  }

  for (const i of state.incomes) {
    if (i.mode === "salaire") {
      const day = salaryPayDay(y, m);
      tx.push({ day, label: i.label, amount: i.amount, type: "in", cat: "salaire", inc: false });
      if (i.treizieme && (m === 5 || m === 10)) {
        tx.push({ day, label: i.label + " · 13ᵉ mois (½)", amount: i.amount / 2, type: "in", cat: "salaire", inc: false });
      }
      if ((i.bonus ?? 0) > 0 && m === 2) {
        tx.push({ day, label: i.label + " · bonus estimé", amount: i.bonus, type: "in", cat: "salaire", inc: false });
      }
    } else {
      tx.push({
        day: Math.min(i.day, dim),
        label: i.label,
        amount: i.amount,
        type: "in",
        cat: "revenu",
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
export function simulate(state, startY, startM) {
  const out = [];
  let carry = state.soldeDepart;
  for (let k = 0; k < 12; k++) {
    const d = new Date(startY, startM + k, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const dim = daysInMonth(y, m);
    const tx = transactionsOfMonth(state, y, m);
    const daily = [];
    let bal = carry;
    let totalIn = 0;
    let totalOut = 0;
    let min = carry;
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
    out.push({
      y,
      m,
      label: monthLabel(y, m),
      start: carry,
      end: bal,
      min,
      minDay,
      totalIn,
      totalOut,
      tx,
      daily,
    });
    carry = bal;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Agrégats budgétaires d'un mois                                      */
/* ------------------------------------------------------------------ */

/**
 * Total des dépenses planifiées du mois (indexé 0), toutes natures confondues.
 *
 * @returns {{byCat: Record<string,number>, incByCat: Record<string,number>,
 *            incompressible: number, discretionnaire: number, total: number}}
 */
export function monthlyExpenses(state, y, m) {
  const byCat = {};
  const incByCat = {};
  for (const c of CATS) {
    byCat[c.id] = 0;
    incByCat[c.id] = 0;
  }
  let incompressible = 0;
  let total = 0;

  const add = (cat, amount, inc) => {
    const c = byCat[cat] === undefined ? "exceptionnelles" : cat;
    byCat[c] += amount;
    if (inc) {
      incByCat[c] += amount;
      incompressible += amount;
    }
    total += amount;
  };

  for (const e of state.expenses) {
    if (freqInMonth(e.freq, e.month, m)) add(e.cat, e.amount, !!e.incompressible);
  }
  for (const x of state.extras ?? []) {
    if (x.y === y && x.m === m) add(x.cat ?? "exceptionnelles", x.amount, !!x.incompressible);
  }

  return { byCat, incByCat, incompressible, discretionnaire: total - incompressible, total };
}
