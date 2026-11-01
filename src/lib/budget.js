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
  TAXONOMIE,
  defaultTaxonomie,
  envelopeOf,
  extraOneShot,
  subIncompressible,
  subRecurring,
  subTransfer,
  taxCat,
  taxSub,
  subNature,
  TAXO_FLAGS_VERSION,
  applyDefaultFlags,
} from "./taxonomie.js";
import { DEFAULT_ESTIMATION, normEstimation } from "./estimation.js";

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

/**
 * Abréviations de mois en 3 caractères, alignées sur MONTHS — pour les axes
 * de graphiques compacts. « Jun »/« Jul » distinguent juin et juillet, que la
 * troncature à 3 lettres confondrait sinon (« Jui »).
 */
export const MONTHS_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
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

/**
 * Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien).
 * Retourne [mois 0-indexé, jour].
 */
function easterSunday(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}

/**
 * Jours fériés légaux français : fixes (Jour de l'an, 1er et 8 mai, 14 juillet,
 * 15 août, Toussaint, 11 novembre, Noël) et mobiles (lundi de Pâques,
 * Ascension, lundi de Pentecôte) calculés à partir de Pâques.
 */
export function isHoliday(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (
    (m === 0 && d === 1) || (m === 4 && d === 1) || (m === 4 && d === 8) ||
    (m === 6 && d === 14) || (m === 7 && d === 15) || (m === 10 && d === 1) ||
    (m === 10 && d === 11) || (m === 11 && d === 25)
  ) {
    return true;
  }
  const [em, ed] = easterSunday(y);
  const diff = Math.round((new Date(y, m, d) - new Date(y, em, ed)) / 86400000);
  return diff === 1 || diff === 39 || diff === 50;
}

/** Samedis/dimanches et jours fériés français exclus. */
export function isBusinessDay(date) {
  const w = date.getDay();
  return w !== 0 && w !== 6 && !isHoliday(date);
}

/** Dernier jour ouvré d'un mois (semaine de 5 jours, hors jours fériés). */
export function lastBusinessDay(y, m) {
  const d = new Date(y, m + 1, 0);
  while (!isBusinessDay(d)) d.setDate(d.getDate() - 1);
  return new Date(d);
}

/**
 * Jour de versement d'un salaire : l'avant-veille du dernier jour ouvré du mois,
 * c'est-à-dire 2 jours ouvrés avant le dernier jour ouvré (week-ends et jours
 * fériés français franchis).
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
  // Sauvegarde automatique : réglage persisté avec l'état (téléchargement
  // d'une sauvegarde datée après chaque import de relevé, voir App.jsx).
  s.backup = { auto: s.backup?.auto !== false, lastAt: s.backup?.lastAt ?? null };
  // Historisation des prévisions : instantanés par mois, jamais écrasés.
  s.forecastSnapshots = s.forecastSnapshots ?? {};
  // Marqueurs 🔁/🔒 par défaut : appliqués une seule fois (fusion), puis la
  // version est enregistrée pour ne plus écraser les choix de l'utilisateur.
  if (s.taxoFlagsVersion !== TAXO_FLAGS_VERSION) {
    s.taxonomie = applyDefaultFlags(s.taxonomie);
    // v4 : « Épargne bancaire » (Livret A, PEL…) n'est plus marquée
    // récurrente 🔁. Les mouvements d'épargne sont des transferts internes ⇄
    // décidés au cas par cas : jamais planifiés, jamais appris comme
    // habitude. La fusion par défaut ne fait qu'ajouter des marqueurs, il
    // faut donc retirer explicitement le 🔁 posé par les versions
    // antérieures, et convertir les écritures planifiées éventuelles
    // (créées par l'import des relevés tant que le couple était 🔁) en
    // dépenses non planifiées datées, occurrence par occurrence — même
    // argent, même mois, même jour : rien n'est perdu ni dupliqué, et le
    // rapprochement au réimport (date + montant) reste idempotent.
    if ((raw?.taxoFlagsVersion ?? 0) < 4) {
      s.taxonomie = s.taxonomie.map((c) =>
        c.id !== "epargne"
          ? c
          : {
              ...c,
              subs: c.subs.map((x) =>
                x.id === "epargne-bancaire" ? { ...x, recurring: false } : x
              ),
            }
      );
      const converted = [];
      s.expenses = (s.expenses ?? []).filter((e) => {
        if (e.sub !== "epargne-bancaire") return true;
        for (const h of e.history ?? []) {
          converted.push({
            id: `${e.id}-epargne-${h.y}-${h.m}-${h.day}`,
            label: e.label,
            amount: Math.abs(h.amount),
            day: h.day,
            y: h.y,
            m: h.m,
            cat: e.cat,
            sub: e.sub,
          });
        }
        return false;
      });
      if (converted.length) s.extras = [...(s.extras ?? []), ...converted];
    }
    // v5 : une écriture planifiée née d'une coïncidence de montant observée
    // sur un seul mois (ex. courses au même prix par hasard) n'est pas une
    // habitude mensuelle — elle redevient une dépense non planifiée datée,
    // occurrence par occurrence (mêmes dates, mêmes montants : aucun solde
    // ne change). Ne sont visées que les séries AMBIGUËS — libellé suffixé
    // « · montant » : plusieurs montants distincts observés pour le même
    // couple, signature de dépenses variables (alimentation, transports…).
    // Une série unique pour son couple (ex. « Crédit conso », un seul
    // montant observé) peut être un vrai engagement mensuel : elle est
    // conservée. Les séries confirmées sur au moins deux mois restent
    // planifiées, l'import n'en crée plus d'unimensuelles, et la moyenne
    // par jour des dépenses variables est portée par le modèle d'habitudes.
    if ((raw?.taxoFlagsVersion ?? 0) < 5) {
      const coincidental = [];
      s.expenses = (s.expenses ?? []).filter((e) => {
        if (
          (e.freq !== "mensuelle" && e.freq !== "annuelle") ||
          !e.history?.length ||
          new Set(e.history.map((h) => h.y + "-" + h.m)).size >= 2 ||
          !String(e.label).includes(" · ")
        ) {
          return true;
        }
        for (const h of e.history) {
          coincidental.push({
            id: `${e.id}-occ-${h.y}-${h.m}-${h.day}`,
            label: e.label,
            amount: Math.abs(h.amount ?? e.amount),
            day: h.day,
            y: h.y,
            m: h.m,
            cat: e.cat,
            sub: e.sub,
          });
        }
        return false;
      });
      if (coincidental.length) s.extras = [...(s.extras ?? []), ...coincidental];
    }
    // v6 : « Alimentation » n'est plus planifiée en séries mensuelles. Les
    // courses au même prix qui reviennent plusieurs mois de suite sont des
    // habitudes d'achat, pas des mensualités : même confirmées sur ≥ 2 mois,
    // elles redeviennent des dépenses non planifiées datées, occurrence par
    // occurrence (mêmes dates, mêmes montants : aucun solde ne change) — la
    // moyenne par jour est portée par le modèle d'habitudes. Une écriture
    // ALIMENTAIRE créée à la main (sans historique réel) est conservée :
    // c'est un choix explicite de l'utilisateur. Les autres couples
    // récurrents (transports quotidiens 🔁, téléphonie, frais bancaires,
    // emprunts…) restent planifiés.
    if ((raw?.taxoFlagsVersion ?? 0) < 6) {
      const panier = [];
      s.expenses = (s.expenses ?? []).filter((e) => {
        if (e.sub !== "alimentation" || !e.history?.length) return true;
        for (const h of e.history) {
          panier.push({
            id: `${e.id}-occ-${h.y}-${h.m}-${h.day}`,
            label: e.label,
            amount: Math.abs(h.amount ?? e.amount),
            day: h.day,
            y: h.y,
            m: h.m,
            cat: e.cat,
            sub: e.sub,
          });
        }
        return false;
      });
      if (panier.length) s.extras = [...(s.extras ?? []), ...panier];
    }
    s.taxoFlagsVersion = TAXO_FLAGS_VERSION;
  }
  // Réglages du modèle prédictif (fenêtre, seuil de présence, statistique) :
  // défauts fusionnés avec les choix de l'utilisateur, bornés.
  s.estimation = normEstimation({ ...DEFAULT_ESTIMATION, ...(raw?.estimation ?? {}) });
  // Crédits sur couples de DÉPENSE importés avant les remboursements
  // (v0.31.0) : ils étaient stockés comme des REVENUS uniques (montant
  // positif). Alignement sur la nouvelle sémantique — conversion en
  // remboursements (extras négatifs ↩ : même crédit au solde, mais une
  // dépense en moins de leur couple dans les totaux et l'apprentissage des
  // habitudes). Un remboursement identique déjà présent (créé par le
  // réimport du même relevé sous v0.31.0) absorbe le revenu hérité : la
  // double représentation disparaît, un seul crédit reste. Comme le registre
  // d'import (addKnown/consumeKnown), l'absorption essaie la clé étiquetée
  // puis, à défaut, la clé sans libellé : la banque reformule parfois le
  // libellé d'une même opération entre deux exports, et l'opération
  // re-libellée ne doit pas échapper à l'absorption. Les revenus des
  // couples de revenu ou inconnus (« À classer ») et les écritures planifiées
  // (modes fixe/salaire, sans date unique) ne sont pas touchés.
  const refundKeys = new Map();
  const keyRefund = (y, m, day, amount, opLabel) => [y, m, day, Math.round(amount * 100), opLabel ?? ""].join("|");
  for (const x of s.extras ?? []) {
    if (x && typeof x.amount === "number" && x.amount < 0 && Number.isFinite(x.y) && Number.isFinite(x.m)) {
      const k = keyRefund(x.y, x.m, x.day, x.amount, x.opLabel);
      refundKeys.set(k, (refundKeys.get(k) ?? 0) + 1);
      if (x.opLabel) {
        const ku = keyRefund(x.y, x.m, x.day, x.amount, "");
        refundKeys.set(ku, (refundKeys.get(ku) ?? 0) + 1);
      }
    }
  }
  const keepIncomes = [];
  const asRefunds = [];
  let incomesChanged = false;
  for (const i of s.incomes ?? []) {
    const c = taxCat(i.cat, s.taxonomie);
    const sub = c ? taxSub(c.id, i.sub, s.taxonomie) : undefined;
    const herite =
      i.mode === "unique" &&
      c && subNature(c, sub) === "depense" &&
      typeof i.amount === "number" && i.amount > 0 &&
      Number.isFinite(i.y) && Number.isFinite(i.m);
    if (!herite) {
      keepIncomes.push(i);
      continue;
    }
    incomesChanged = true;
    // Absorption : clé étiquetée, puis repli sans libellé (opération
    // re-libellée par la banque entre deux exports).
    let absorbed = false;
    for (const k of [keyRefund(i.y, i.m, i.day, -i.amount, i.opLabel), keyRefund(i.y, i.m, i.day, -i.amount, "")]) {
      const n = refundKeys.get(k) ?? 0;
      if (n > 0) {
        refundKeys.set(k, n - 1);
        absorbed = true;
        break;
      }
    }
    if (absorbed) {
      // Déjà représenté par le remboursement du réimport : le revenu hérité
      // disparaît, rien n'est créé (pas de double décompte du crédit).
      continue;
    }
    asRefunds.push({
      id: i.id,
      label: i.label,
      amount: -i.amount,
      day: i.day,
      y: i.y,
      m: i.m,
      cat: i.cat,
      sub: i.sub,
      opLabel: i.opLabel,
      refund: true,
    });
  }
  if (incomesChanged) s.incomes = keepIncomes;
  if (asRefunds.length) s.extras = [...(s.extras ?? []), ...asRefunds];
  return s;
}

/* ------------------------------------------------------------------ */
/* Opérations d'un mois                                                */
/* ------------------------------------------------------------------ */

/**
 * Récurrence d'une dépense planifiée : elle est récurrente si son motif
 * l'est (mensuel ou annuel) ET si son couple catégorie / sous-catégorie est
 * marqué « récurrente 🔁 » dans la nomenclature — ce sont les paramètres de
 * la nomenclature qui décident, comme pour l'incompressible. Une dépense
 * mensuelle sur un couple non 🔁 reste planifiée (budget, simulation,
 * opérations du mois) mais n'est pas un prélèvement régulier : elle
 * n'apparaît pas dans l'échéancier récurrent.
 */
export function isRecurringExpense(e, taxo = TAXONOMIE) {
  return (e.freq === "mensuelle" || e.freq === "annuelle") && subRecurring(e.cat, e.sub, taxo);
}

/**
 * Récurrence d'un revenu : salaires et revenus à jour fixe sont récurrents
 * si leur couple est marqué 🔁 (les revenus sans couple précis suivent
 * « Salaire fixe », marqué 🔁 par défaut) ; seul le mode `unique` ne
 * l'est jamais.
 */
export function isRecurringIncome(i, taxo = TAXONOMIE) {
  return i.mode !== "unique" && subRecurring(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo);
}

/**
 * Liste des opérations d'un mois donné, triées par jour.
 * - paiements récurrents : dépenses mensuelles ou annuelles (jour ramené à la
 *   fin des mois courts — les dates restent stables d'un mois sur l'autre) et
 *   revenus récurrents (salaire versé l'avant-veille du dernier jour ouvré,
 *   ½ du 13ᵉ mois en juin et novembre, bonus estimé en mars, jour fixe)
 * - opérations exceptionnelles, uniquement celles flaguées comme telles :
 *   dépenses à date précise {y, m, day} et revenus uniques
 * - chaque opération porte `rec` (récurrent) en plus de `inc`
 *   (incompressible) : `rec` suit le marqueur 🔁 du couple dans la
 *   nomenclature — une écriture planifiée sur un couple non 🔁 est
 *   comptée dans le mois (elle est budgétée) mais exclue de l'échéancier
 *   récurrent.
 *
 * @returns {Array<{day:number,label:string,amount:number,type:"in"|"out",cat:string,sub?:string,inc:boolean,rec:boolean}>}
 */
export function transactionsOfMonth(state, y, m) {
  const tx = [];
  const dim = daysInMonth(y, m);
  const taxo = state.taxonomie ?? TAXONOMIE;

  for (const e of state.expenses) {
    if (e.freq !== "mensuelle" && e.freq !== "annuelle") continue; // hors modèle
    if (e.freq === "annuelle" && (e.month ?? 1) - 1 !== m) continue;
    tx.push({
      day: Math.min(e.day, dim),
      label: e.label,
      amount: -e.amount,
      type: "out",
      cat: e.cat,
      sub: e.sub,
      inc: !!e.incompressible || subIncompressible(e.cat, e.sub, taxo),
      rec: subRecurring(e.cat, e.sub, taxo),
      transfer: subTransfer(e.cat, e.sub, taxo),
    });
  }

  for (const x of state.extras ?? []) {
    if (x.y !== y || x.m !== m) continue;
    // Remboursement (montant négatif) : crédit sur le compte. Un transfert
    // interne (retrait d'épargne) reste « in » ⇄ ; sinon type « refund » :
    // le total des dépenses du mois est décrémenté (dépense en moins du
    // couple), jamais compté comme un revenu.
    const transfer = subTransfer(x.cat ?? "logement", x.sub ?? "frais-exceptionnels", taxo);
    tx.push({
      day: Math.min(x.day, dim),
      label: x.label,
      amount: -x.amount,
      type: x.amount < 0 ? (transfer ? "in" : "refund") : "out",
      cat: x.cat ?? "logement",
      sub: x.sub ?? "frais-exceptionnels",
      inc: !!x.incompressible || subIncompressible(x.cat, x.sub, state.taxonomie),
      rec: false,
      transfer,
    });
  }

  for (const i of state.incomes) {
    // Un revenu non unique est versé chaque mois (salaire ou jour fixe) ;
    // il n'est « récurrent 🔁 » que si son couple l'est dans la nomenclature.
    const rec = isRecurringIncome(i, taxo);
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
        rec: false,
        transfer: subTransfer(i.cat ?? "revenus-travail", i.sub, taxo),
      });
    } else if (i.mode === "salaire") {
      const day = salaryPayDay(y, m);
      tx.push({ day, label: i.label, amount: i.amount, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec });
      if (i.treizieme && (m === 5 || m === 10)) {
        tx.push({ day, label: i.label + " · 13ᵉ mois (½)", amount: i.amount / 2, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec });
      }
      if ((i.bonus ?? 0) > 0 && m === 2) {
        tx.push({ day, label: i.label + " · bonus estimé", amount: i.bonus, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec });
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
        rec,
        transfer: subTransfer(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo),
      });
    }
  }

  tx.sort((a, b) => a.day - b.day);
  return tx;
}

/**
 * Échéancier récurrent d'un mois : les paiements récurrents du mois groupés
 * par jour d'échéance, triés du premier au dernier jour. Les dates étant
 * stables d'un mois sur l'autre (souvent similaires), cet échéancier dessine
 * la trajectoire du solde — et donc les point bas — des mois à venir.
 *
 * @returns {Array<{day:number, total:number, ops:Array}>}
 */
export function recurringSchedule(state, y, m) {
  const tx = transactionsOfMonth(state, y, m).filter((t) => t.rec);
  const byDay = new Map();
  for (const t of tx) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day).push(t);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, ops]) => ({
      day,
      total: ops.reduce((a, t) => a + t.amount, 0),
      ops,
    }));
}

/**
 * Totaux récurrents d'un mois : nombre de jours d'échéance, nombre
 * d'opérations récurrentes, débits, crédits et net. Les opérations
 * exceptionnelles et les revenus uniques en sont exclus.
 */
export function recurringMonthTotals(state, y, m) {
  const sched = recurringSchedule(state, y, m);
  const ops = sched.flatMap((d) => d.ops);
  return {
    days: sched.length,
    count: ops.length,
    totalOut: ops.filter((o) => o.type === "out").reduce((a, o) => a - o.amount, 0),
    totalIn: ops.filter((o) => o.type === "in").reduce((a, o) => a + o.amount, 0),
    net: ops.reduce((a, o) => a + o.amount, 0),
  };
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
  return buildMonth(y, m, opening, transactionsOfMonth(state, y, m));
}

/**
 * Total des remboursements ↩ (et autres crédits « refund ») d'un mois simulé :
 * argent réellement perçu sur le compte mais compté en dépenses en moins,
 * jamais dans `totalIn`. Attention au signe : dans les transactions du mois,
 * un événement « refund » porte un montant POSITIF (crédit reçu) — c'est
 * l'extra sous-jacent qui est négatif.
 */
export function refundsTotal(tx) {
  return (tx ?? []).filter((t) => t.type === "refund").reduce((a, t) => a + t.amount, 0);
}

/**
 * Simulation d'un mois CHARGÉ sur des données réelles : les flux du mois
 * sont les transactions réellement importées (occurrences d'historique,
 * exceptionnels, revenus uniques). Avec `today` (mois courant), les
 * écritures planifiées sans occurrence complètent la fin du mois en
 * prévision ; `realSoFar` expose le cumul réel jusqu'à ce jour pour un
 * « solde actuel » exact.
 */
export function realMonthSim(state, y, m, opening, { today = null } = {}) {
  return buildMonth(y, m, opening, realTransactionsOfMonth(state, y, m, { today }), { today });
}

/**
 * Fenêtre des 12 mois simulés à partir de (y, m) : le mois de départ suit les
 * flux réels s'il est chargé (complétés en prévision jusqu'à `today`), les
 * suivants enchaînent les écritures planifiées mois après mois. Utilisée pour
 * la projection standard et pour la simulation « et si… » avec un état de
 * scénario (applyScenario).
 */
export function yearSims(state, y, m, opening, { today = null } = {}) {
  if (hasRealData(state, y, m)) {
    const out = [];
    let carry = opening;
    let yy = y;
    let mm = m;
    for (let i = 0; i < 12; i++) {
      const month = i === 0
        ? realMonthSim(state, yy, mm, carry, { today })
        : monthSim(state, yy, mm, carry);
      out.push(month);
      carry = month.end;
      const d = new Date(yy, mm + 1, 1);
      yy = d.getFullYear();
      mm = d.getMonth();
    }
    return out;
  }
  return simulate(state, y, m, opening);
}

/**
 * État modifié par un scénario « et si… » : revenus récurrents (salaire,
 * montants fixes) ajustés d'un pourcentage, et/ou nouvelle dépense fixe
 * mensuelle. Les revenus uniques et l'historique des occurrences ne bougent
 * pas : le scénario projette l'avenir, il ne réécrit pas les données. Les
 * mois réellement chargés restent sur leurs flux réels (le scénario ne
 * s'applique qu'aux mois simulés).
 */
export function applyScenario(state, { salaryPct = 0, extraExpense = null } = {}) {
  const factor = 1 + salaryPct / 100;
  const incomes =
    factor === 1
      ? state.incomes
      : state.incomes.map((i) =>
          i.mode === "unique" ? i : { ...i, amount: Math.round(i.amount * factor * 100) / 100 }
        );
  const expenses =
    extraExpense && extraExpense.amount > 0
      ? [
          ...state.expenses,
          {
            id: "what-if",
            label: (extraExpense.label ?? "").trim() || "Dépense scénario",
            amount: extraExpense.amount,
            day: extraExpense.day ?? 1,
            freq: "mensuelle",
            cat: extraExpense.cat,
            sub: extraExpense.sub,
            incompressible: false,
          },
        ]
      : state.expenses;
  return { ...state, incomes, expenses };
}

/**
 * Historique des flux d'épargne RÉELS sur les mois chargés : pour chaque mois
 * (du plus ancien au plus récent), versements, retraits, flux net et cumul
 * depuis le premier mois chargé — la trajectoire de la réserve telle que le
 * relevé la montre. `cumul > 0` : la période a épargné ; `cumul < 0` : la
 * réserve a été sollicitée.
 *
 * @returns {Array<{y:number,m:number,label:string,versements:number,retraits:number,net:number,cumul:number}>}
 */
export function savingsFlowHistory(state) {
  const out = [];
  let cumul = 0;
  for (const d of loadedMonths(state)) {
    let versements = 0;
    let retraits = 0;
    for (const t of realTransactionsOfMonth(state, d.y, d.m)) {
      if (!t.transfer) continue;
      if (t.amount < 0) versements += -t.amount;
      else retraits += t.amount;
    }
    const net = versements - retraits;
    cumul += net;
    out.push({ y: d.y, m: d.m, label: monthLabel(d.y, d.m), versements, retraits, net, cumul });
  }
  return out;
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
  // Les occurrences réelles rattachées aux écritures planifiées (historique
  // des imports) chargent aussi leur mois : un mois couvert uniquement par
  // des récurrences est un mois réel.
  for (const e of state.expenses ?? []) for (const h of e.history ?? []) add(h.y, h.m);
  for (const i of state.incomes ?? []) for (const h of i.history ?? []) add(h.y, h.m);
  return [...byKey.values()].sort((a, b) => a.y - b.y || a.m - b.m);
}

/**
 * Le mois (y, m) contient-il des données réelles chargées (relevé importé) :
 * dépense exceptionnelle, revenu unique ou occurrence d'historique ?
 */
export function hasRealData(state, y, m) {
  for (const x of state.extras ?? []) if (x.y === y && x.m === m) return true;
  for (const i of state.incomes ?? []) {
    if (i.mode === "unique" && i.y === y && i.m === m) return true;
    for (const h of i.history ?? []) if (h.y === y && h.m === m) return true;
  }
  for (const e of state.expenses ?? [])
    for (const h of e.history ?? []) if (h.y === y && h.m === m) return true;
  return false;
}

/** Seuil d'ancienneté (jours) au-delà duquel le rappel d'export s'affiche. */
export const BACKUP_STALE_DAYS = 30;

/**
 * Biais du modèle prédictif, mesuré sur l'historisation des prévisions :
 * pour chaque mois TERMINÉ (strictement avant le mois courant) disposant
 * d'un instantané (`forecastSnapshots`, clé "y-m") ET de données réelles
 * chargées (`months` : objets avec `hasData` et `end`), l'écart entre le
 * solde réel et le solde probable prévu à l'époque (réel − prévu).
 *
 * @returns {{samples: Array<{y,m,reel,prevu,ecart}>, mean: number, count: number}}
 *   `mean > 0` : le modèle annonce plus bas que le réel (habitudes moins
 *   chères que prévu) ; `mean < 0` : le modèle annonce trop haut.
 */
export function forecastBias(snapshots = {}, months = [], now = new Date()) {
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const samples = [];
  for (const [key, snap] of Object.entries(snapshots ?? {})) {
    const [y, m] = key.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    if (y > nowY || (y === nowY && m >= nowM)) continue; // futur ou en cours
    if (typeof snap?.probable !== "number") continue;
    const mo = months.find((x) => x.y === y && x.m === m);
    if (!mo || !mo.hasData) continue; // pas de réel pour comparer
    samples.push({ y, m, reel: mo.end, prevu: snap.probable, ecart: mo.end - snap.probable });
  }
  samples.sort((a, b) => a.y - b.y || a.m - b.m);
  const mean = samples.length ? samples.reduce((a, s) => a + s.ecart, 0) / samples.length : 0;
  return { samples, mean, count: samples.length };
}

/**
 * Comparaison temporelle d'un mois chargé (v0.36) : le mois demandé face au
 * mois précédent et au même mois de l'année précédente. Ne compare que des
 * mois disposant de données réelles (`hasData`) ; les autres ressortent
 * `null` (« non chargé » côté interface).
 *
 * @param {Array} months  mois disponibles (champs `y`, `m`, `hasData`,
 *   `totalIn`, `totalOut`, `end`, `fluxEpargne`) — ex. `monthsAll` d'App.jsx
 * @param {number} y  année du mois de référence
 * @param {number} m  mois de référence (0-indexé)
 * @returns {{
 *   current: Object|null, prev: Object|null, lastYear: Object|null,
 *   revenues: {diff:number,pct:number|null}|null,
 *   depenses: {diff:number,pct:number|null}|null,
 *   epargne: {diff:number,pct:number|null}|null,
 *   solde: {diff:number,pct:number|null}|null,
 * }}  `pct` = évolution en fraction (0,1 = +10 %), null si base nulle.
 */
export function monthComparison(months = [], y, m) {
  const pick = (yy, mm) => {
    const mo = (months ?? []).find((x) => x.y === yy && x.m === mm);
    if (!mo || !mo.hasData) return null;
    return {
      y: yy,
      m: mm,
      totalIn: mo.totalIn,
      totalOut: mo.totalOut,
      end: mo.end,
      fluxEpargne: mo.fluxEpargne ?? 0,
      tauxEpargne: mo.totalIn > 0 ? (mo.totalIn - mo.totalOut) / mo.totalIn : null,
    };
  };
  const cur = pick(y, m);
  const prev = pick(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
  const lastYear = pick(y - 1, m);
  // Écarts vs mois précédent uniquement (le N−1 sert de repère visuel).
  const delta = (field) => {
    if (!cur || !prev) return null;
    const diff = cur[field] - prev[field];
    const base = prev[field];
    return { diff, pct: base > 0 ? diff / base : null };
  };
  return {
    current: cur,
    prev,
    lastYear,
    revenues: delta("totalIn"),
    depenses: delta("totalOut"),
    epargne: delta("fluxEpargne"),
    solde: delta("end"),
  };
}

/**
 * Âge en jours de la dernière sauvegarde exportée (fichier JSON téléchargé
 * via 💾). `null` si jamais exportée ou date invalide.
 */
export function backupAgeDays(lastAt, now = new Date()) {
  if (!lastAt) return null;
  const t = new Date(lastAt).getTime();
  if (isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

/**
 * Transactions RÉELLES du mois (y, m), reconstruites des données chargées :
 * occurrences d'historique des écritures planifiées (dates et montants
 * observés), dépenses exceptionnelles et revenus uniques. Les écritures
 * planifiées ne sont PAS re-planifiées pour un mois chargé : leur occurrence
 * réelle les remplace (pas de double comptage, pas de récurrente fantôme
 * sur un mois où elle n'a pas eu lieu).
 *
 * Avec `today` (jour du mois courant), les écritures planifiées sans
 * occurrence réelle ce mois-ci sont ajoutées en prévision pour compléter
 * le mois : le solde « actuel » (jour `today`) n'en compte que les
 * occurrences réelles jusqu'à ce jour.
 */
export function realTransactionsOfMonth(state, y, m, { today = null } = {}) {
  const tx = [];
  const dim = daysInMonth(y, m);
  const taxo = state.taxonomie ?? TAXONOMIE;
  const occurred = new Set(); // écritures ayant une occurrence réelle ce mois

  // Occurrences réelles des écritures planifiées (historique d'import).
  for (const e of state.expenses) {
    if (e.freq !== "mensuelle" && e.freq !== "annuelle") continue;
    for (const h of e.history ?? []) {
      if (h.y !== y || h.m !== m) continue;
      occurred.add(e.id);
      tx.push({
        day: Math.min(h.day ?? e.day, dim),
        label: e.label,
        amount: -(h.amount ?? e.amount),
        type: "out",
        cat: e.cat,
        sub: e.sub,
        inc: !!e.incompressible || subIncompressible(e.cat, e.sub, taxo),
        rec: subRecurring(e.cat, e.sub, taxo),
        real: true,
        transfer: subTransfer(e.cat, e.sub, taxo),
      });
    }
  }
  for (const i of state.incomes) {
    for (const h of i.history ?? []) {
      if (h.y !== y || h.m !== m) continue;
      occurred.add(i.id);
      tx.push({
        day: Math.min(h.day ?? i.day ?? dim, dim),
        label: i.label,
        amount: h.amount ?? i.amount,
        type: "in",
        cat: i.cat ?? "revenus-travail",
        sub: i.sub ?? "salaire-fixe",
        inc: false,
        rec: isRecurringIncome(i, taxo),
        real: true,
        transfer: subTransfer(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo),
      });
    }
  }

  // Dépenses exceptionnelles réelles du mois. Un montant négatif est un
  // remboursement : crédit sur le compte, dépense en moins de son couple
  // (type « refund ») — ou retrait d'épargne ⇄ si le couple est un transfert
  // interne.
  for (const x of state.extras ?? []) {
    if (x.y !== y || x.m !== m) continue;
    const transfer = subTransfer(x.cat ?? "logement", x.sub ?? "frais-exceptionnels", state.taxonomie);
    tx.push({
      day: Math.min(x.day, dim),
      label: x.label,
      amount: -x.amount,
      type: x.amount < 0 ? (transfer ? "in" : "refund") : "out",
      cat: x.cat ?? "logement",
      sub: x.sub ?? "frais-exceptionnels",
      inc: !!x.incompressible || subIncompressible(x.cat, x.sub, state.taxonomie),
      rec: false,
      real: true,
      transfer,
    });
  }

  // Revenus uniques réels du mois.
  for (const i of state.incomes ?? []) {
    if (i.mode !== "unique" || i.y !== y || i.m !== m) continue;
    tx.push({
      day: Math.min(i.day, dim),
      label: i.label,
      amount: i.amount,
      type: "in",
      cat: i.cat ?? "revenus-travail",
      sub: i.sub,
      inc: false,
      rec: false,
      real: true,
      transfer: subTransfer(i.cat ?? "revenus-travail", i.sub, taxo),
    });
  }

  // Mois courant : prévision des écritures planifiées sans occurrence réelle
  // (le relevé ne couvre que le passé — le reste du mois reste à prévoir).
  // Le relevé couvre tout le mois jusqu'à hier : une planifiée à échéance
  // PASSÉE sans occurrence n'a simplement pas eu lieu ce mois-ci. La
  // réinjecter à son jour nominal fausserait les soldes quotidiens déjà
  // réels (double comptage avec les lignes réelles du relevé, creux
  // fantômes dans la courbe) : seules les échéances à venir — jour
  // `today` ou après — complètent la fin du mois.
  if (today !== null) {
    const fromDay = Math.max(1, Math.min(Number(today) || dim, dim));
    for (const e of state.expenses) {
      if (e.freq !== "mensuelle" && e.freq !== "annuelle") continue;
      if (e.freq === "annuelle" && (e.month ?? 1) - 1 !== m) continue;
      if (occurred.has(e.id)) continue;
      const day = Math.min(e.day, dim);
      if (day < fromDay) continue;
      tx.push({
        day,
        label: e.label,
        amount: -e.amount,
        type: "out",
        cat: e.cat,
        sub: e.sub,
        inc: !!e.incompressible || subIncompressible(e.cat, e.sub, taxo),
        rec: subRecurring(e.cat, e.sub, taxo),
        real: false,
        transfer: subTransfer(e.cat, e.sub, taxo),
      });
    }
    for (const i of state.incomes) {
      if (i.mode === "unique" || occurred.has(i.id)) continue;
      if (i.mode === "salaire") {
        const day = salaryPayDay(y, m);
        if (day < fromDay) continue;
        const rec = isRecurringIncome(i, taxo);
        tx.push({ day, label: i.label, amount: i.amount, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec, real: false, transfer: subTransfer(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo) });
        if (i.treizieme && (m === 5 || m === 10)) {
          tx.push({ day, label: i.label + " · 13ᵉ mois (½)", amount: i.amount / 2, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec, real: false, transfer: subTransfer(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo) });
        }
        if ((i.bonus ?? 0) > 0 && m === 2) {
          tx.push({ day, label: i.label + " · bonus estimé", amount: i.bonus, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec, real: false, transfer: subTransfer(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo) });
        }
      } else {
        const day = Math.min(i.day, dim);
        if (day < fromDay) continue;
        tx.push({ day, label: i.label, amount: i.amount, type: "in", cat: i.cat ?? "revenus-travail", sub: i.sub ?? "salaire-fixe", inc: false, rec: isRecurringIncome(i, taxo), real: false, transfer: subTransfer(i.cat ?? "revenus-travail", i.sub ?? "salaire-fixe", taxo) });
      }
    }
  }

  tx.sort((a, b) => a.day - b.day);
  return tx;
}

/**
 * Cœur de `monthSim` / `realMonthSim` : enchaîne des transactions données
 * jour après jour sur un solde d'ouverture.
 */
function buildMonth(y, m, opening, tx, { today = null } = {}) {
  const dim = daysInMonth(y, m);
  const daily = [];
  let bal = opening;
  let totalIn = 0; // entrées du mois HORS transferts internes
  let totalOut = 0; // sorties du mois HORS transferts internes
  let transferIn = 0; // retraits de la réserve d'épargne (crédités sur le compte)
  let transferOut = 0; // versements vers la réserve d'épargne (débités du compte)
  let min = opening;
  let minDay = 0;
  let realSoFar = 0; // somme des flux RÉELS jusqu'au jour `today` (mois courant)
  daily.push({ day: 0, solde: bal, date: "1er " + MONTHS[m], events: [] });
  for (let day = 1; day <= dim; day++) {
    const events = tx.filter((t) => t.day === day);
    for (const e of events) {
      bal += e.amount;
      if (e.transfer) {
        if (e.type === "in") transferIn += e.amount;
        else transferOut += -e.amount;
      } else if (e.type === "in") totalIn += e.amount;
      else totalOut += -e.amount;
      if (today !== null && day <= today && e.real) realSoFar += e.amount;
    }
    daily.push({ day, solde: bal, date: day + " " + MONTHS[m], events });
    if (bal < min) {
      min = bal;
      minDay = day;
    }
  }
  return {
    y, m, label: monthLabel(y, m), start: opening, end: bal, min, minDay,
    totalIn, totalOut, tx, daily, realSoFar,
    transferIn, transferOut,
    // Flux d'épargne net du mois : versements − retraits. Positif = mise de
    // côté ; négatif = réserve sollicitée (alerte). 0 = aucun transfert.
    fluxEpargne: transferOut - transferIn,
  };
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
 *   Les dépenses récurrentes et les dépenses non planifiées de la vie
 *   courante sont rangées via la nomenclature bancaire (voir
 *   taxonomie.js → envelopeOf) ; seules les dépenses one-shot comptent dans
 *   l'enveloppe « Exceptionnelles ».
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

  let transfers = 0; // total des dépenses de transfert interne (épargne)
  const add = (env, cat, amount, inc, sub) => {
    if (subTransfer(cat, sub, taxo)) {
      // Transfert interne (versement d'épargne) : ne compte ni dans les
      // enveloppes ni dans les totaux budgétaires — l'argent reste à vous.
      transfers += amount;
      return;
    }
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
      // Dépense one-shot → enveloppe « Exceptionnelles ». Dépense non
      // planifiée de la vie courante → enveloppe de son couple bancaire :
      // la vue par enveloppe reflète le réel, pas seulement le planifié.
      add(
        extraOneShot(x, taxo) ? "exceptionnelles" : envelopeOf(x.cat, x.sub, taxo),
        x.cat ?? "logement",
        x.amount,
        !!x.incompressible || subIncompressible(x.cat, x.sub, taxo),
        x.sub ?? "frais-exceptionnels"
      );
    }
  }

  return { byEnv, incByEnv, byCat, incByCat, detail, incompressible, discretionnaire: total - incompressible, total, transfers };
}
