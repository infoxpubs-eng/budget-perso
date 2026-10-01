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

/**
 * Liste des opérations d'un mois donné, triées par jour.
 * @returns {Array<{day:number,label:string,amount:number,type:"in"|"out",cat:string}>}
 */
export function transactionsOfMonth(state, y, m) {
  const tx = [];
  const dim = daysInMonth(y, m);
  for (const e of state.expenses) {
    if (e.freq === "annuelle" && (e.month ?? 1) - 1 !== m) continue;
    tx.push({ day: Math.min(e.day, dim), label: e.label, amount: -e.amount, type: "out", cat: e.cat });
  }
  for (const i of state.incomes) {
    if (i.freq === "annuelle" && (i.month ?? 1) - 1 !== m) continue;
    tx.push({ day: Math.min(i.day, dim), label: i.label, amount: i.amount, type: "in", cat: "revenu" });
  }
  tx.sort((a, b) => a.day - b.day);
  return tx;
}

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

/**
 * Total des dépenses planifiées du mois `m` (indexé 0), par catégorie.
 * @returns {Record<string, number>}
 */
export function expensesByCat(expenses, m) {
  const map = {};
  for (const c of CATS) map[c.id] = 0;
  for (const e of expenses) {
    if (freqInMonth(e.freq, e.month, m)) map[e.cat] = (map[e.cat] ?? 0) + e.amount;
  }
  return map;
}
