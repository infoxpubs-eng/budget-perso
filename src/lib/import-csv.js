/**
 * import-csv.js — Import d'un relevé bancaire au format CSV.
 *
 * Format attendu (export « Guadeloupe / GDB », séparateur « ; ») :
 *   Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;
 * ou, avec la colonne optionnelle « Libellé opération » (export détaillé) :
 *   Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;
 *
 * - Montant au format français (« -22,67 ») : négatif = dépense, positif = revenu.
 * - Catégorie / Sous-Catégorie rapprochées de la nomenclature bancaire
 *   (taxonomie.js) de façon tolérante : accents, casse, «…» et parenthèses
 *   ignorés ; une sous-catégorie inconnue reste importée sans sous-catégorie.
 * - Colonne « Libellé opération » (optionnelle) : elle n'est pas utilisée
 *   comme intitulé ; elle aide uniquement à déterminer la sous-catégorie
 *   quand la colonne Sous-Catégorie est inconnue (recherche par inclusion
 *   dans le libellé d'opération). L'intitulé des écritures reste le libellé
 *   simple : sous-catégorie, sinon catégorie.
 * - Seules les lignes à date ou montant illisible (ou nul) sont ignorées :
 *   les couples catégorie / sous-catégorie absents de la nomenclature sont
 *   conservés puis ajoutés dans la catégorie « À classer » à la conversion.
 * - C'est la nomenclature qui pilote l'import (voir rowsToEntries) : les
 *   paramètres du couple — marqueurs « récurrente 🔁 » et « incompressible
 *   🔒 » — déterminent comment chaque ligne est intégrée.
 * - Les lignes correspondant à des écritures déjà planifiées (dépenses
 *   récurrentes, revenus) ne sont pas importées en double : elles sont
 *   comptées dans `recurrentes`.
 *
 * Chaque ligne devient :
 *   - couple marqué 🔁 → une écriture récurrente planifiée, une seule par
 *     couple et montant (jour type = jour le plus fréquent) ; les lignes du
 *     relevé couvertes ne sont pas importées en double ;
 *   - sinon, dépense  → une dépense exceptionnelle (date précise) ;
 *   - sinon, revenu   → un revenu unique (mode "unique", versé une seule fois).
 *
 * Module sans dépendance React : testable isolément (voir import-csv.test.js).
 */

import { TAXONOMIE, catByLabel, subByLabel, subByOperation, slugify, subIncompressible, subRecurring, addCategory, addSubcategory, taxSub, normalizeLabel } from "./taxonomie.js";

/* ------------------------------------------------------------------ */
/* Analyse CSV                                                          */
/* ------------------------------------------------------------------ */

/** Découpe une ligne en cellules (guillemets gérés, séparateur `delim`). */
function splitLine(line, delim) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Date française « jj/mm/aaaa » → { day, m (0-11), y } ou undefined. */
export function parseFrDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return undefined;
  return { day, m: mo - 1, y };
}

/** Montant français « -22,67 » ou « 1 234,56 € » → nombre, ou undefined. */
export function parseFrAmount(s) {
  const cleaned = String(s ?? "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/€/g, "")
    .trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(cleaned)) return undefined;
  const n = parseFloat(cleaned.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/* ------------------------------------------------------------------ */
/* Analyse du fichier complet                                           */
/* ------------------------------------------------------------------ */

/**
 * Analyse le contenu d'un CSV bancaire.
 *
 * @returns {{ rows: Array<{day:number,m:number,y:number,amount:number,
 *                          cat:string,sub?:string,label:string}>,
 *            ignored: number, categoriesInconnues: string[]}}
 * @throws si l'en-tête ne contient pas les colonnes attendues.
 */
/**
 * Analyse un relevé bancaire CSV. `taxo` (optionnel) est la nomenclature
 * utilisée pour la reconnaissance des catégories/sous-catégories — par
 * défaut la nomenclature de référence, sinon celle de l'état (console
 * d'administration) passée par l'appelant.
 */
export function parseCsv(text, taxo = TAXONOMIE) {
  const src = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const lines = src.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return { rows: [], ignored: 0, categoriesInconnues: [] };

  // Séparateur : « ; » par défaut, « , » si nettement plus fréquent dans l'en-tête.
  const semi = (lines[0].match(/;/g) ?? []).length;
  const comma = (lines[0].match(/,/g) ?? []).length;
  const delim = semi >= comma ? ";" : ",";

  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());
  const col = (name) => header.indexOf(name);
  const iDate = col("date transaction") >= 0 ? col("date transaction") : col("date comptabilisation");
  const iCat = col("catégorie") >= 0 ? col("catégorie") : col("categorie");
  const iSub = col("sous-catégorie") >= 0 ? col("sous-catégorie") : col("sous-categorie");
  const iAmount = col("montant");
  // Colonne « Libellé opération » (optionnelle) : intitulé réel de l'écriture.
  const iLabel = header.findIndex((h) => h.includes("libell"));
  if (iDate < 0 || iCat < 0 || iAmount < 0) {
    throw new Error(
      "colonnes attendues introuvables (il faut au moins : date, catégorie, montant)"
    );
  }

  const rows = [];
  const inconnues = new Set();
  let ignored = 0;

  for (let k = 1; k < lines.length; k++) {
    const cells = splitLine(lines[k], delim);
    const date = parseFrDate(cells[iDate]);
    const amount = parseFrAmount(cells[iAmount]);
    const catLabel = cells[iCat] ?? "";
    const subLabel = iSub >= 0 ? cells[iSub] ?? "" : "";
    const cat = catByLabel(catLabel, taxo);
    // Libellé de l'opération : aide à déterminer la sous-catégorie quand la
    // colonne Sous-Catégorie est inconnue (recherche par inclusion).
    const opLabel = iLabel >= 0 ? cells[iLabel] ?? "" : "";
    const sub = cat
      ? (subByLabel(cat.id, subLabel, taxo) ??
        (opLabel !== "" ? subByOperation(cat.id, opLabel, taxo) : undefined))
      : undefined;

    if (!date || amount === undefined || amount === 0) {
      ignored++;
      continue;
    }

    // Catégorie du relevé inconnue : la ligne est conservée avec ses
    // libellés d'origine — le couple sera ajouté dans « À classer » à la
    // conversion (rowsToEntries), rien n'est perdu.
    if (!cat && catLabel) inconnues.add(catLabel);

    rows.push({
      day: date.day,
      m: date.m,
      y: date.y,
      amount,
      cat: cat ? cat.id : undefined,
      sub: sub ? sub.id : undefined,
      label: sub ? sub.label : catLabel,
      catLabel,
      subLabel,
    });
  }

  return { rows, ignored, categoriesInconnues: [...inconnues] };
}

/* ------------------------------------------------------------------ */
/* Conversion vers le modèle de l'application                          */
/* ------------------------------------------------------------------ */

let seq = 0;
function newId() {
  seq = (seq + 1) % 100000;
  return "csv-" + Date.now().toString(36) + "-" + seq;
}

/** Identifiant de la catégorie d'accueil des couples absents de la nomenclature. */
export const A_CLASSER = "a-classer";
/** Libellé de la catégorie d'accueil des couples absents de la nomenclature. */
export const A_CLASSER_LABEL = "À classer";

/**
 * Fusionne les observations réelles d'une écriture récurrente (historique
 * du relevé : dates et montants observés). Dédupliquées par date et montant
 * (un même relevé réimporté n'ajoute rien), triées par date croissante.
 *
 * @param {Array<{day:number,m:number,y:number,amount:number}>} existing
 * @param {Array<{day:number,m:number,y:number,amount:number}>} obs
 */
export function mergeHistory(existing = [], obs = []) {
  const seen = new Set();
  const out = [];
  for (const o of [...(existing ?? []), ...(obs ?? [])]) {
    const key = o.y + "-" + o.m + "-" + o.day + "|" + Math.round(o.amount * 100);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day: o.day, m: o.m, y: o.y, amount: o.amount });
  }
  return out.sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.day - b.day));
}

/**
 * Valeur la plus fréquente d'un tableau (la première insérée l'emporte en
 * cas d'égalité) — jour type d'un prélèvement récurrent, par exemple.
 */
function modeOf(values) {
  const counts = new Map();
  let best;
  let n = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > n) {
      n = c;
      best = v;
    }
  }
  return best;
}

/** Le couple (catégorie, sous-catégorie) est-il marqué récurrent 🔁 dans la nomenclature ? */
const subIsRecurring = subRecurring;

/**
 * Convertit les lignes analysées en entrées du modèle. C'est la nomenclature
 * qui pilote l'import : les paramètres du couple catégorie / sous-catégorie
 * déterminent comment chaque ligne est intégrée.
 *
 * - Couple marqué 🔁 (récurrent) → une écriture récurrente planifiée, une
 *   seule par couple et montant (jour type = jour le plus fréquent des
 *   occurrences ; incompressible 🔒 repris de la nomenclature). Les lignes
 *   du relevé ainsi couvertes ne sont PAS importées en double. Une ligne
 *   🔁 déjà couverte par une écriture planifiée (catégorie, sous-catégorie,
 *   montant à 0,01 € près) est comptée dans `recurrentes`.
 * - Sinon, débit → dépense exceptionnelle ; crédit → revenu unique.
 * - Une ligne non 🔁 correspondant à une écriture déjà planifiée (même
 *   catégorie/sous-catégorie, même montant à 0,01 € près, mois compatible
 *   avec la fréquence) n'est pas importée : comptée dans `recurrentes`
 *   (chaque écriture planifiée consommée une seule fois).
 * - Couple catégorie / sous-catégorie absent de la nomenclature (catégorie
 *   inconnue, ou sous-catégorie introuvable) : le couple est ajouté dans
 *   `taxoAdditions` (à intégrer dans la catégorie « À classer ») et la ligne
 *   référence ce couple — rien n'est ignoré.
 *
 * @param {Array} rows lignes analysées (voir parseCsv)
 * @param {{expenses?:Array,incomes?:Array}} planned écritures déjà planifiées
 * @param {Array} taxo nomenclature (paramètres des couples)
 *
 * @returns {{ extras: Array, incomes: Array,
 *             recurrentes: Array<{label:string,amount:number,kind:"depense"|"revenu"}>,
 *             newExpenses: Array, newIncomes: Array,
 *             taxoAdditions: Array<{label:string,nature:"depense"|"revenu"}>,
 *             coveredHistory: Array<{id:string,kind:"depense"|"revenu",
 *                                     obs:Array<{day:number,m:number,y:number,amount:number}>}>,
 *             couvertesOut: number, couvertesIn: number,
 *             depensesTotal: number, revenusTotal: number }}
 */
export function rowsToEntries(rows, planned = {}, taxo = TAXONOMIE) {
  const expenses = planned.expenses ?? [];
  const incomesPlanned = planned.incomes ?? [];
  const extras = [];
  const incomes = [];
  const recurrentes = [];
  const newExpenses = [];
  const newIncomes = [];
  const taxoAdditions = [];
  let depensesTotal = 0;
  let revenusTotal = 0;
  let couvertesOut = 0;
  let couvertesIn = 0;
  const usedExpenses = new Set();
  const usedIncomes = new Set();
  const addedCouples = new Set();

  // Couples absents de la nomenclature → « À classer » (dédupliqués par libellé).
  const resolved = rows.map((r) => {
    if (r.cat !== undefined && (r.sub !== undefined || !r.subLabel)) return r;
    const label = String((r.subLabel || r.catLabel || "").trim());
    if (!label) return r; // pas d'information de couple : ligne telle quelle
    const kk = label.toLowerCase();
    if (!addedCouples.has(kk)) {
      addedCouples.add(kk);
      taxoAdditions.push({ label, nature: r.amount < 0 ? "depense" : "revenu" });
    }
    return { ...r, cat: A_CLASSER, sub: slugify(label), label };
  });

  // Occurrences réelles des écritures déjà planifiées (historique réel du
  // relevé : dates et montants observés), indexées par écriture couverte.
  const covered = new Map();
  const recordObs = (x, kind, r) => {
    const k = kind + "|" + x.id;
    if (!covered.has(k)) covered.set(k, { id: x.id, kind, obs: [] });
    covered.get(k).obs.push({
      day: r.day,
      m: r.m,
      y: r.y,
      amount: kind === "depense" ? -r.amount : r.amount,
    });
  };

  // Prélèvements récurrents 🔁 : groupés par couple et montant (en centimes).
  const groupsOut = new Map();
  const groupsIn = new Map();

  for (const r of resolved) {
    if (r.amount < 0) {
      if (subIsRecurring(r.cat, r.sub, taxo)) {
        const x = expenses.find((x) => matchesPlannedExpense(r, x));
        if (x) {
          recordObs(x, "depense", r);
          recurrentes.push({ label: x.label, amount: -r.amount, kind: "depense" });
          continue;
        }
        const key = r.cat + "|" + r.sub + "|" + Math.round(-r.amount * 100);
        if (!groupsOut.has(key)) groupsOut.set(key, []);
        groupsOut.get(key).push(r);
        continue;
      }
      const e = expenses.find(
        (x) => !usedExpenses.has(x.id) && matchesPlannedExpense(r, x)
      );
      if (e) {
        usedExpenses.add(e.id);
        recordObs(e, "depense", r);
        recurrentes.push({ label: e.label, amount: -r.amount, kind: "depense" });
        continue;
      }
      extras.push({
        id: newId(),
        label: r.label,
        amount: -r.amount,
        day: r.day,
        y: r.y,
        m: r.m,
        cat: r.cat,
        sub: r.sub,
      });
      depensesTotal += -r.amount;
    } else {
      if (subIsRecurring(r.cat, r.sub, taxo)) {
        const x = incomesPlanned.find((x) => matchesPlannedIncome(r, x));
        if (x) {
          recordObs(x, "revenu", r);
          recurrentes.push({ label: x.label, amount: r.amount, kind: "revenu" });
          continue;
        }
        const key = r.cat + "|" + r.sub + "|" + Math.round(r.amount * 100);
        if (!groupsIn.has(key)) groupsIn.set(key, []);
        groupsIn.get(key).push(r);
        continue;
      }
      const i = incomesPlanned.find(
        (x) => !usedIncomes.has(x.id) && matchesPlannedIncome(r, x)
      );
      if (i) {
        usedIncomes.add(i.id);
        recordObs(i, "revenu", r);
        recurrentes.push({ label: i.label, amount: r.amount, kind: "revenu" });
        continue;
      }
      incomes.push({
        id: newId(),
        label: r.label,
        amount: r.amount,
        mode: "unique",
        day: r.day,
        y: r.y,
        m: r.m,
        cat: r.cat,
        sub: r.sub,
      });
      revenusTotal += r.amount;
    }
  }

  // Une écriture récurrente par groupe (couple + montant). Plusieurs montants
  // pour un même couple → une écriture chacun, avec le montant en suffixe.
  const couplesOut = new Map();
  for (const key of groupsOut.keys()) {
    const ck = key.split("|").slice(0, 2).join("|");
    couplesOut.set(ck, (couplesOut.get(ck) ?? 0) + 1);
  }
  for (const [key, rs] of groupsOut) {
    const [cat, sub, cents] = key.split("|");
    const amount = Number(cents) / 100;
    const label =
      (couplesOut.get(cat + "|" + sub) ?? 0) > 1
        ? rs[0].label + " · " + amount.toFixed(2).replace(".", ",") + " €"
        : rs[0].label;
    newExpenses.push({
      id: newId(),
      label,
      amount,
      day: modeOf(rs.map((x) => x.day)),
      cat,
      sub,
      freq: "mensuelle",
      incompressible: subIncompressible(cat, sub, taxo),
      history: rs.map((x) => ({ day: x.day, m: x.m, y: x.y, amount: -x.amount })),
    });
    couvertesOut += rs.length;
  }

  const couplesIn = new Map();
  for (const key of groupsIn.keys()) {
    const ck = key.split("|").slice(0, 2).join("|");
    couplesIn.set(ck, (couplesIn.get(ck) ?? 0) + 1);
  }
  for (const [key, rs] of groupsIn) {
    const [cat, sub, cents] = key.split("|");
    const amount = Number(cents) / 100;
    const label =
      (couplesIn.get(cat + "|" + sub) ?? 0) > 1
        ? rs[0].label + " · " + amount.toFixed(2).replace(".", ",") + " €"
        : rs[0].label;
    newIncomes.push({
      id: newId(),
      label,
      amount,
      mode: "fixe",
      day: modeOf(rs.map((x) => x.day)),
      cat,
      sub,
      history: rs.map((x) => ({ day: x.day, m: x.m, y: x.y, amount: x.amount })),
    });
    couvertesIn += rs.length;
  }

  return {
    extras,
    incomes,
    recurrentes,
    newExpenses,
    newIncomes,
    taxoAdditions,
    couvertesOut,
    couvertesIn,
    coveredHistory: [...covered.values()],
    depensesTotal,
    revenusTotal,
  };
}

/**
 * Intègre les couples absents de la nomenclature (`taxoAdditions`) — pure.
 * Chaque couple peut être rangé dans une catégorie choisie et renommé :
 * `choices[i] = { cat?: string, label?: string }` (défaut : « À classer » et
 * le libellé d'origine). Un couple existant déjà dans la catégorie cible sous
 * le même libellé n'est pas recréé — les lignes s'y rattachent.
 *
 * @returns {{ taxo: Array, mapping: Array<{from:string,cat:string,sub:string,label:string}> }}
 *           `mapping[i].from` vaut `A_CLASSER + "|" + slugify(libellé d'origine)` :
 *           les écritures importées qui référencent le couple y sont rattachées.
 */
export function applyTaxoAdditions(taxo, additions, choices = []) {
  let next = taxo;
  const mapping = [];
  for (let i = 0; i < additions.length; i++) {
    const a = additions[i];
    const cat = (choices[i] && choices[i].cat) || A_CLASSER;
    const label = String((choices[i] && choices[i].label) || a.label).trim();
    if (cat === A_CLASSER && !next.some((c) => c.id === A_CLASSER)) {
      next = addCategory(next, { label: A_CLASSER_LABEL, nature: "depense", env: "exceptionnelles" });
    }
    let sub = taxSub(cat, slugify(label), next);
    if (!sub) {
      // Même libellé sous un id suffixé (créé autrement) : s'y rattacher.
      const c0 = next.find((x) => x.id === cat);
      sub = c0 && c0.subs.find((s) => normalizeLabel(s.label) === normalizeLabel(label));
    }
    if (!sub) {
      next = addSubcategory(next, cat, { label, nature: a.nature });
      const c = next.find((x) => x.id === cat);
      // addSubcategory suffixe l'id en cas de collision : cherche par libellé.
      sub = c && c.subs.find((s) => s.label === label);
    }
    if (sub) {
      mapping.push({ from: A_CLASSER + "|" + slugify(a.label), cat, sub: sub.id, label });
    }
  }
  return { taxo: next, mapping };
}

/**
 * Tolérance (€) du rapprochement montant relevé / montant planifié.
 */
const TOL = 0.01;

/**
 * Une ligne de débit correspond-elle à une dépense récurrente déjà planifiée ?
 * Même catégorie et sous-catégorie, même montant à 0,01 € près, et mois
 * compatible avec la fréquence (mensuelle : tous les mois ; annuelle : le
 * mois prévu uniquement).
 */
export function matchesPlannedExpense(row, e) {
  if (e.cat !== row.cat) return false;
  if ((e.sub ?? undefined) !== (row.sub ?? undefined)) return false;
  if (Math.abs(e.amount - (-row.amount)) > TOL) return false;
  return e.freq !== "annuelle" || (e.month ?? 1) - 1 === row.m;
}

/**
 * Une ligne de crédit correspond-elle à un revenu déjà planifié ?
 * Même montant à 0,01 € près ; la catégorie bancaire est comparée quand le
 * revenu planifié en précise une. Revenus « fixe » / « salaire » : versés
 * chaque mois ; « unique » : uniquement à la date prévue.
 */
export function matchesPlannedIncome(row, i) {
  if (Math.abs(i.amount - row.amount) > TOL) return false;
  if (i.cat && i.cat !== row.cat) return false;
  if (i.mode === "unique") return i.y === row.y && i.m === row.m;
  return true;
}
