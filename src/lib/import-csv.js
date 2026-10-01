/**
 * import-csv.js — Import d'un relevé bancaire au format CSV.
 *
 * Format attendu (export « Guadeloupe / GDB », séparateur « ; ») :
 *   Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;
 *
 * - Montant au format français (« -22,67 ») : négatif = dépense, positif = revenu.
 * - Catégorie / Sous-Catégorie rapprochées de la nomenclature bancaire
 *   (taxonomie.js) de façon tolérante : accents, casse, «…» et parenthèses
 *   ignorés ; une sous-catégorie inconnue reste importée sans sous-catégorie.
 * - Les lignes dont la catégorie est inconnue (ou la date / le montant
 *   illisibles) sont ignorées et comptées.
 *
 * Chaque ligne devient :
 *   - dépense  → une dépense exceptionnelle (date précise) ;
 *   - revenu   → un revenu unique (mode "unique", versé une seule fois).
 *
 * Module sans dépendance React : testable isolément (voir import-csv.test.js).
 */

import { catByLabel, subByLabel, taxCat, taxSub } from "./taxonomie.js";

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
export function parseCsv(text) {
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
    const cat = catByLabel(catLabel);
    const sub = cat ? subByLabel(cat.id, subLabel) : undefined;

    if (!date || amount === undefined || amount === 0 || !cat) {
      ignored++;
      if (catLabel && !cat) inconnues.add(catLabel);
      continue;
    }

    rows.push({
      day: date.day,
      m: date.m,
      y: date.y,
      amount,
      cat: cat.id,
      sub: sub ? sub.id : undefined,
      label: sub ? sub.label : cat.label,
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

/**
 * Convertit les lignes analysées en entrées du modèle :
 * montants négatifs → dépenses exceptionnelles (extras), positifs → revenus uniques.
 *
 * @returns {{ extras: Array, incomes: Array, depensesTotal: number, revenusTotal: number }}
 */
export function rowsToEntries(rows) {
  const extras = [];
  const incomes = [];
  let depensesTotal = 0;
  let revenusTotal = 0;
  for (const r of rows) {
    if (r.amount < 0) {
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
  return { extras, incomes, depensesTotal, revenusTotal };
}
