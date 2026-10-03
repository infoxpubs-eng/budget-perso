/**
 * Estimation des habitudes de dépenses non planifiées.
 *
 * Le modèle prédictif du solde de fin de mois superpose deux couches :
 *
 * - la couche certaine : les écritures planifiées (récurrentes 🔁 et
 *   débits planifiés) déjà simulées par `simulate` / `monthSim` ;
 * - la couche probable : les habitudes de dépenses « non planifiées »,
 *   apprises des relevés importés (lignes qui n'ont ni couple 🔁 ni
 *   écriture planifiée : restaurants, taxis, courses…).
 *
 * Pour chaque couple catégorie / sous-catégorie non planifié, la tendance
 * est la MÉDIANE des totaux mensuels observés sur une fenêtre d'au plus 6
 * mois complets (les mois sans dépense comptent zéro). Une tendance n'est
 * provisionnée que si le couple est présent dans au moins la moitié des
 * mois de la fenêtre : les dépenses exceptionnelles (présence faible)
 * n'influencent pas la prévision. La provision restante du mois courant est
 * ce qu'il reste de la tendance après les dépenses déjà observées :
 * `max(0, tendance − déjà dépensé ce mois-ci)`, lissée sur les jours
 * restants et réactualisée à chaque import.
 *
 * Aucun revenu statistique n'est estimé : les revenus (salaires, virements
 * reçus, remboursements) restent exclus de ce module.
 */

/** Fenêtre maximale d'apprentissage (mois complets, zéros inclus). */
export const TENDENCY_WINDOW = 6;
/** Présence minimale (fraction des mois de la fenêtre) pour provisionner. */
export const PRESENCE_MIN = 0.5;

/** Index linéaire d'un mois (m 0-indexé) : avril 2026 → 24321*12+3. */
const monthIdx = (y, m) => y * 12 + m;
const idxMonth = (i) => ({ y: Math.floor(i / 12), m: i % 12 });

/**
 * Médiane d'un tableau de nombres (0 si vide) — les deux valeurs du
 * milieu sont moyennées si le nombre d'éléments est pair.
 */
export function medianOf(values = []) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Totaux mensuels de dépenses par couple, indexés "cat|sub" → mois → total.
 * Les montants sont des magnitudes positives ; les entrées sans date
 * valident sont ignorées.
 *
 * @param {Array<{amount:number,day:number,m:number,y:number,cat:string,sub:string}>} extras
 * @returns {Map<string, Map<number, number>>}
 */
export function monthlySpendByCouple(extras = []) {
  const by = new Map();
  for (const x of extras ?? []) {
    if (!x || typeof x.amount !== "number" || x.amount <= 0) continue;
    if (!Number.isFinite(x.y) || !Number.isFinite(x.m)) continue;
    const k = (x.cat ?? "?") + "|" + (x.sub ?? "?");
    if (!by.has(k)) by.set(k, new Map());
    const months = by.get(k);
    const mk = monthIdx(x.y, x.m);
    months.set(mk, (months.get(mk) ?? 0) + x.amount);
  }
  return by;
}

/**
 * Tendances par couple : médiane des totaux mensuels sur la fenêtre
 * (≤ TENDENCY_WINDOW mois complets, zéros inclus), uniquement si le couple
 * est présent dans au moins PRESENCE_MIN des mois de la fenêtre — sinon 0
 * (dépense exceptionnelle ou habitude éteinte).
 *
 * La fenêtre couvre les mois complets AVANT `upto` (le mois cible) : le
 * mois en cours, partiellement dépensé, ne tire pas la tendance vers le
 * bas. Sans `upto`, tous les mois observés comptent.
 *
 * @param {Array} extras dépenses importées non planifiées
 * @param {{y:number,m:number}} [upto] mois cible (exclu de la fenêtre)
 * @returns {Array<{cat:string,sub:string,tendency:number,presence:number,
 *                   months:number,windowMonths:number,lastMonth:{y:number,m:number}|null}>}
 *           triées par tendance décroissante.
 */
export function coupleTendencies(extras = [], upto) {
  const by = monthlySpendByCouple(extras);
  let minIdx = Infinity;
  let maxIdx = -Infinity;
  for (const months of by.values()) {
    for (const k of months.keys()) {
      if (k < minIdx) minIdx = k;
      if (k > maxIdx) maxIdx = k;
    }
  }
  if (maxIdx === -Infinity) return [];
  const uptoIdx = upto ? monthIdx(upto.y, upto.m) : maxIdx + 1;
  // Fenêtre : les ≤ 6 derniers mois observés strictement avant `upto`.
  const hi = Math.min(maxIdx, uptoIdx - 1);
  const lo = Math.max(minIdx, hi - (TENDENCY_WINDOW - 1));
  if (hi < lo) return [];
  const windowMonths = hi - lo + 1;
  const out = [];
  for (const [k, months] of by) {
    const [cat, sub] = k.split("|");
    const totals = [];
    let presence = 0;
    let lastIdx = null;
    for (let i = lo; i <= hi; i++) {
      const t = months.get(i) ?? 0;
      totals.push(t);
      if (t > 0) {
        presence++;
        lastIdx = i;
      }
    }
    const tendency = presence / windowMonths >= PRESENCE_MIN ? medianOf(totals) : 0;
    out.push({
      cat,
      sub,
      tendency,
      presence,
      months: presence,
      windowMonths,
      lastMonth: lastIdx === null ? null : idxMonth(lastIdx),
    });
  }
  return out.sort((a, b) => b.tendency - a.tendency || a.cat.localeCompare(b.cat));
}

/**
 * Provision restante du mois (y, m) pour les habitudes non planifiées :
 * par couple, `max(0, tendance − dépensé ce mois-ci)`.
 *
 * - Les couples portés par une écriture planifiée (quelle que soit sa
 *   fréquence) sont exclus : pas de double comptage avec la simulation.
 * - Aucune donnée (cold start) → provision nulle.
 * - Les revenus ne sont jamais estimés statistiquement.
 *
 * @param {{extras?:Array, expenses?:Array, y:number, m:number}} args
 * @returns {{lines:Array<{cat:string,sub:string,tendency:number,spent:number,left:number}>, total:number}}
 */
export function remainingProvision({ extras = [], expenses = [], y, m } = {}) {
  if (!Number.isFinite(y) || !Number.isFinite(m)) return { lines: [], total: 0 };
  const tendencies = coupleTendencies(extras, { y, m });
  const planned = new Set();
  for (const e of expenses ?? []) planned.add((e.cat ?? "?") + "|" + (e.sub ?? "?"));
  const spentBy = new Map();
  for (const x of extras ?? []) {
    if (x && x.y === y && x.m === m && typeof x.amount === "number") {
      const k = (x.cat ?? "?") + "|" + (x.sub ?? "?");
      spentBy.set(k, (spentBy.get(k) ?? 0) + x.amount);
    }
  }
  const lines = [];
  let total = 0;
  for (const t of tendencies) {
    if (t.tendency <= 0) continue;
    const k = t.cat + "|" + t.sub;
    if (planned.has(k)) continue;
    const spent = spentBy.get(k) ?? 0;
    const left = Math.max(0, t.tendency - spent);
    lines.push({ cat: t.cat, sub: t.sub, tendency: t.tendency, spent, left });
    total += left;
  }
  return { lines, total };
}
