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
 * est la statistique (médiane par défaut) des totaux mensuels observés sur
 * une fenêtre de quelques mois complets (les mois sans dépense comptent
 * zéro). Une tendance n'est provisionnée que si le couple est présent
 * dans au moins une fraction des mois de la fenêtre (50 % par défaut) :
 * les dépenses exceptionnelles (présence faible) n'influencent pas la
 * prévision. La provision restante du mois courant est ce qu'il reste de
 * la tendance après les dépenses déjà observées :
 * `max(0, tendance − déjà dépensé ce mois-ci)`, lissée sur les jours
 * restants et réactualisée à chaque import.
 *
 * Aucun revenu statistique n'est estimé : les revenus (salaires, virements
 * reçus, remboursements) restent exclus de ce module.
 *
 * Les trois réglages du modèle (fenêtre d'apprentissage, seuil de
 * présence, statistique de tendance) sont paramétrables via `settings`
 * (voir `DEFAULT_ESTIMATION`), persistés avec l'état et éditables dans
 * la console 🛠️ Admin.
 */

/** Fenêtre d'apprentissage par défaut (mois complets, zéros inclus). */
export const TENDENCY_WINDOW = 6;
/** Présence minimale par défaut (fraction des mois de la fenêtre) pour provisionner. */
export const PRESENCE_MIN = 0.5;
/**
 * Réglages par défaut du modèle, persistés avec l'état (`state.estimation`)
 * et éditables dans la console 🛠️ Admin :
 * - `window` : fenêtre d'apprentissage (1 à 24 mois complets) ;
 * - `presenceMin` : présence minimale, fraction de 0 à 1 des mois de la
 *   fenêtre (50 % par défaut — avec des fenêtres paires, la médiane à
 *   zéros inclus est déjà nulle en dessous de la moitié) ;
 * - `stat` : statistique de tendance, "mediane" (peu sensible aux
 *   extrêmes) ou "moyenne" (suit les gros mois).
 */
export const DEFAULT_ESTIMATION = {
  window: TENDENCY_WINDOW,
  presenceMin: PRESENCE_MIN,
  stat: "mediane",
};

/** Normalise les réglages (bornes sûres, replis sur les défauts). */
export function normEstimation(settings = {}) {
  const s = settings ?? {};
  const w = Number(s.window);
  const p = Number(s.presenceMin);
  return {
    window: Number.isFinite(w) && w >= 1 ? Math.min(24, Math.round(w)) : TENDENCY_WINDOW,
    presenceMin: Number.isFinite(p) && p >= 0 ? Math.min(1, p) : PRESENCE_MIN,
    stat: s.stat === "moyenne" ? "moyenne" : "mediane",
  };
}

/** Index linéaire d'un mois (m 0-indexé) : avril 2026 → 2026*12+3. */
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

/** Moyenne d'un tableau de nombres (0 si vide). */
export function meanOf(values = []) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Totaux mensuels de dépenses par couple, indexés "cat|sub" → mois → total.
 * Les montants sont des magnitudes positives ; les entrées sans date
 * valides sont ignorées.
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
 * Tendances par couple : statistique (`stat`) des totaux mensuels sur la
 * fenêtre (`window` mois complets, zéros inclus), uniquement si le couple
 * est présent dans au moins `presenceMin` des mois de la fenêtre — sinon 0
 * (dépense exceptionnelle ou habitude éteinte).
 *
 * La fenêtre couvre les mois complets AVANT `upto` (le mois cible) : le
 * mois en cours, partiellement dépensé, ne tire pas la tendance vers le
 * bas. Sans `upto`, tous les mois observés comptent.
 *
 * @param {Array} extras dépenses importées non planifiées
 * @param {{y:number,m:number}} [upto] mois cible (exclu de la fenêtre)
 * @param {{window?:number,presenceMin?:number,stat?:"mediane"|"moyenne"}} [settings]
 * @returns {Array<{cat:string,sub:string,tendency:number,presence:number,
 *                   months:number,windowMonths:number,lastMonth:{y:number,m:number}|null}>}
 *           triées par tendance décroissante.
 */
export function coupleTendencies(extras = [], upto, settings = {}) {
  const cfg = normEstimation(settings);
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
  // Fenêtre : les ≤ window derniers mois observés strictement avant `upto`.
  const hi = Math.min(maxIdx, uptoIdx - 1);
  const lo = Math.max(minIdx, hi - (cfg.window - 1));
  if (hi < lo) return [];
  const windowMonths = hi - lo + 1;
  const statOf = cfg.stat === "moyenne" ? meanOf : medianOf;
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
    const tendency = presence / windowMonths >= cfg.presenceMin ? statOf(totals) : 0;
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
 * @param {{extras?:Array, expenses?:Array, y:number, m:number,
 *          settings?:{window?:number,presenceMin?:number,stat?:"mediane"|"moyenne"}}} args
 * @returns {{lines:Array<{cat:string,sub:string,tendency:number,spent:number,left:number}>, total:number}}
 */
export function remainingProvision({ extras = [], expenses = [], y, m, settings = {} } = {}) {
  if (!Number.isFinite(y) || !Number.isFinite(m)) return { lines: [], total: 0 };
  const cfg = normEstimation(settings);
  const tendencies = coupleTendencies(extras, { y, m }, cfg);
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
