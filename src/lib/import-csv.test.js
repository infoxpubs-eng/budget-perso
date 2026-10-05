import { describe, it, expect } from "vitest";
import { parseCsv, parseFrDate, parseFrAmount, rowsToEntries, matchesPlannedExpense, matchesPlannedIncome, applyTaxoAdditions, mergeHistory, mergeAddedLines, A_CLASSER, EPARGNE_LABEL_RE } from "./import-csv.js";
import { TAXONOMIE, catByLabel, subByLabel, subByOperation, normalizeLabel } from "./taxonomie.js";

/* Extrait réel d'un relevé bancaire (CRLF, séparateur « ; », colonne vide finale). */
const SAMPLE =
  "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\r\n" +
  "30/09/2026;30/09/2026;Abonnements et téléphonie;Téléphonie (fixe et mobile);-22,67;Non;\r\n" +
  "30/09/2026;30/09/2026;Services financiers / professionnels;Frais bancaires et de gestion (dont agios);-1,35;Non;\r\n" +
  "30/09/2026;30/09/2026;Cadeaux et solidarité;Solidarité - Autres;-105,00;Non;\r\n" +
  "30/09/2026;30/09/2026;Services financiers / professionnels;Frais bancaires et de gestion (dont agios);-1,34;Non;\r\n" +
  "30/09/2026;30/09/2026;Services financiers / professionnels;Remboursement de frais;1,35;Non;\r\n" +
  "30/09/2026;30/09/2026;Services financiers / professionnels;Remboursement de frais;1,35;Non;\r\n" +
  "30/09/2026;30/09/2026;Services financiers / professionnels;Frais bancaires et de gestion (dont agios);-1,35;Non;\r\n";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

describe("parseFrDate / parseFrAmount", () => {
  it("analyse une date française jj/mm/aaaa", () => {
    expect(parseFrDate("30/09/2026")).toEqual({ day: 30, m: 8, y: 2026 });
    expect(parseFrDate("05/01/2027")).toEqual({ day: 5, m: 0, y: 2027 });
  });

  it("complète les années à deux chiffres et rejette l'invalid", () => {
    expect(parseFrDate("30/09/26").y).toBe(2026);
    expect(parseFrDate("30/13/2026")).toBeUndefined();
    expect(parseFrDate("nimporte quoi")).toBeUndefined();
  });

  it("analyse un montant français (virgule décimale, espaces, €)", () => {
    expect(parseFrAmount("-22,67")).toBe(-22.67);
    expect(parseFrAmount("1 234,56 €")).toBe(1234.56);
    expect(parseFrAmount("105,00")).toBe(105);
    expect(parseFrAmount("abc")).toBeUndefined();
    expect(parseFrAmount("")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Correspondance par libellé                                          */
/* ------------------------------------------------------------------ */

describe("correspondance par libellé", () => {
  it("retrouve une catégorie malgré accents, casse et «…»", () => {
    expect(catByLabel("Voyages et Transports")?.id).toBe("voyages-transports");
    expect(catByLabel("Services financiers / professionnels")?.id).toBe("services-financiers");
    expect(catByLabel("abonnements et téléphonie")?.id).toBe("abonnements");
    expect(catByLabel("Inconnu")).toBeUndefined();
  });

  it("retrouve une sous-catégorie et tolère les variantes de libellé", () => {
    expect(subByLabel("services-financiers", "Frais bancaires et de gestion (dont agios)")?.id).toBe("frais-bancaires");
    expect(subByLabel("loisirs", "Restaurants, bars, discothèques…")?.id).toBe("restaurants");
    expect(subByLabel("loisirs", "Restaurants, bars, discotheques")?.id).toBe("restaurants");
    expect(subByLabel("logement", "N'existe pas")).toBeUndefined();
  });

  it("normalise accents et ponctuation", () => {
    expect(normalizeLabel("Énergie (électricité, gaz…)")).toBe("energie electricite, gaz");
  });
});

/* ------------------------------------------------------------------ */
/* parseCsv                                                            */
/* ------------------------------------------------------------------ */

describe("parseCsv", () => {
  it("analyse le relevé réel : 7 lignes, 0 ignorée, rapprochement complet", () => {
    const { rows, ignored, categoriesInconnues } = parseCsv(SAMPLE);
    expect(rows).toHaveLength(7);
    expect(ignored).toBe(0);
    expect(categoriesInconnues).toEqual([]);

    const r = rows[0];
    expect(r.day).toBe(30);
    expect(r.m).toBe(8); // septembre, indexé 0
    expect(r.y).toBe(2026);
    expect(r.amount).toBe(-22.67);
    expect(r.cat).toBe("abonnements");
    expect(r.sub).toBe("telephonie");
    expect(r.label).toBe("Téléphonie (fixe et mobile)");

    expect(rows[1].cat).toBe("services-financiers");
    expect(rows[1].sub).toBe("frais-bancaires");
    expect(rows[4].amount).toBe(1.35); // revenu
    expect(rows[4].sub).toBe("remboursement-frais");
  });

  it("tolère un BOM, des fins de ligne mixtes et des lignes vides", () => {
    const { rows } = parseCsv("\uFEFF" + SAMPLE.replace(/\r\n/g, "\n") + "\n\n");
    expect(rows).toHaveLength(7);
  });

  it("n'ignore que les lignes illisibles et conserve les couples inconnus", () => {
    const csv =
      "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\n" +
      "30/09/2026;30/09/2026;Catégorie Mystère;Autre;-10,00;Non;\n" +
      "pas une date;30/09/2026;Loisirs;Restaurants, bars, discothèques…;-10,00;Non;\n" +
      "30/09/2026;30/09/2026;Loisirs;Restaurants, bars, discothèques…;gratuit;Non;\n" +
      "30/09/2026;30/09/2026;Loisirs;Restaurants, bars, discothèques…;0,00;Non;\n" +
      "01/10/2026;01/10/2026;Virements reçus;;250,00;Oui;\n";
    const { rows, ignored, categoriesInconnues } = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(ignored).toBe(3);
    expect(categoriesInconnues).toEqual(["Catégorie Mystère"]);
    // Le couple inconnu est conservé avec ses libellés d'origine.
    expect(rows[0].cat).toBeUndefined();
    expect(rows[0].sub).toBeUndefined();
    expect(rows[0].catLabel).toBe("Catégorie Mystère");
    expect(rows[0].subLabel).toBe("Autre");
    expect(rows[1].cat).toBe("virements-recus");
    expect(rows[1].sub).toBeUndefined();
    expect(rows[1].label).toBe("Virements reçus");
  });

  it("rejette un CSV sans les colonnes attendues", () => {
    expect(() => parseCsv("a;b;c\n1;2;3")).toThrow();
    expect(parseCsv("")).toEqual({ rows: [], ignored: 0, categoriesInconnues: [] });
  });
});

/* ------------------------------------------------------------------ */
/* rowsToEntries                                                       */
/* ------------------------------------------------------------------ */

describe("rowsToEntries", () => {
  it("route les débits vers des dépenses exceptionnelles, les crédits vers des revenus uniques", () => {
    const { rows } = parseCsv(SAMPLE);
    const r = rowsToEntries(rows);
    // Téléphonie 🔁 → écriture récurrente planifiée (1 ligne).
    // Frais bancaires 🔁🔒 : 1,35 € ×2 → un groupe ; 1,34 € → un groupe.
    expect(r.newExpenses).toHaveLength(3);
    expect(r.couvertesOut).toBe(4);
    // Solidarité : seule dépense non récurrente du relevé.
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].amount).toBe(105);
    expect(r.extras[0].cat).toBe("cadeaux-solidarite");
    expect(r.extras[0].sub).toBe("solidarite");
    expect(r.depensesTotal).toBeCloseTo(105);
    // Remboursements de frais : sous-catégorie non 🔁 → revenus uniques.
    expect(r.incomes).toHaveLength(2);
    expect(r.incomes[0].mode).toBe("unique");
    expect(r.incomes[0].amount).toBe(1.35);
    expect(r.incomes[0].cat).toBe("services-financiers");
    expect(r.revenusTotal).toBeCloseTo(2.7);
    expect(r.recurrentes).toHaveLength(0);

    const t = r.newExpenses[0];
    expect(t.amount).toBe(22.67);
    expect(t.day).toBe(30);
    expect(t.cat).toBe("abonnements");
    expect(t.sub).toBe("telephonie");
    expect(t.freq).toBe("mensuelle");
    expect(t.incompressible).toBe(false);
    const f1 = r.newExpenses[1];
    expect(f1.amount).toBeCloseTo(1.35);
    expect(f1.incompressible).toBe(true);
    expect(r.newExpenses[2].amount).toBeCloseTo(1.34);
  });
});

/* ------------------------------------------------------------------ */
/* Rapprochement avec les écritures déjà planifiées (v0.5.0)           */
/* ------------------------------------------------------------------ */

describe("rowsToEntries — écritures déjà planifiées", () => {
  // Lignes de relevé construites directement (même format que parseCsv).
  const row = (over = {}) => ({
    day: 3, m: 8, y: 2026, amount: -850,
    cat: "logement", sub: "loyers-charges", label: "Loyers, Charges",
    ...over,
  });
  const loyer = {
    id: "e1", label: "Loyer", amount: 850, day: 3,
    cat: "logement", sub: "loyers-charges", freq: "mensuelle",
  };

  it("ne double pas une dépense récurrente déjà planifiée", () => {
    const { extras, recurrentes, newExpenses, depensesTotal } = rowsToEntries([row()], { expenses: [loyer] });
    expect(extras).toHaveLength(0);
    expect(newExpenses).toHaveLength(0);
    expect(recurrentes).toEqual([{ label: "Loyer", amount: 850, kind: "depense" }]);
    expect(depensesTotal).toBe(0);
  });

  it("rattache une ligne 🔁 au montant inconnu à l'écriture du couple (historique + synchronisation)", () => {
    const elec = { ...loyer, id: "e2", sub: "energie", amount: 95 };
    const { extras, recurrentes, newExpenses, couvertesOut, coveredHistory } = rowsToEntries(
      [row({ amount: -101.34, sub: "energie" })],
      { expenses: [elec] }
    );
    // Pas de nouvelle écriture : la ligne est rattachée à l'écriture
    // existante du couple ; son montant prévisionnel suivra la dernière
    // occurrence observée (flag syncAmount).
    expect(recurrentes).toEqual([{ label: "Loyer", amount: 101.34, kind: "depense" }]);
    expect(extras).toHaveLength(0);
    expect(newExpenses).toHaveLength(0);
    expect(couvertesOut).toBe(0);
    expect(coveredHistory).toEqual([
      {
        id: "e2",
        kind: "depense",
        obs: [{ day: 3, m: 8, y: 2026, amount: 101.34 }],
        syncAmount: true,
      },
    ]);
  });

  it("respecte le mois prévu d'une dépense annuelle", () => {
    const vacances = { ...loyer, id: "e3", cat: "voyages-transports", sub: "hebergement", amount: 1200, freq: "annuelle", month: 7 };
    const juillet = row({ m: 6, amount: -1200, cat: "voyages-transports", sub: "hebergement" });
    const juin = row({ m: 5, amount: -1200, cat: "voyages-transports", sub: "hebergement" });
    const r = rowsToEntries([juillet, juin], { expenses: [vacances] });
    expect(r.recurrentes).toHaveLength(1);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].m).toBe(5);
  });

  it("consomme chaque écriture planifiée une seule fois", () => {
    // Restaurants : sous-catégorie non 🔁 → comportement historique.
    const resto = (n) => ({ id: "r" + n, label: "Resto " + n, amount: 220, day: 5, cat: "loisirs", sub: "restaurants", freq: "mensuelle" });
    const ligne = () => row({ amount: -220, cat: "loisirs", sub: "restaurants", label: "Restaurants, bars, discothèques…" });
    const r = rowsToEntries([ligne(), ligne(), ligne()], { expenses: [resto(1), resto(2)] });
    expect(r.recurrentes).toHaveLength(2);
    expect(r.extras).toHaveLength(1);
    expect(r.newExpenses).toHaveLength(0);
  });

  it("une ligne 🔁 couverte par une écriture planifiée est comptée, jamais doublée", () => {
    // Alimentation 🔁 : les 3 lignes matchent l'une des deux écritures planifiées.
    const courses = (n) => ({ id: "c" + n, label: "Courses " + n, amount: 220, day: 5, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" });
    const ligne = () => row({ amount: -220, cat: "vie-quotidienne", sub: "alimentation" });
    const r = rowsToEntries([ligne(), ligne(), ligne()], { expenses: [courses(1), courses(2)] });
    expect(r.recurrentes).toHaveLength(3);
    expect(r.extras).toHaveLength(0);
    expect(r.newExpenses).toHaveLength(0);
  });

  it("ne double pas un revenu déjà planifié (mode fixe)", () => {
    const aide = { id: "i1", label: "Aide / allocations", amount: 180, day: 5, mode: "fixe" };
    const r = rowsToEntries([row({ amount: 180 })], { incomes: [aide] });
    expect(r.incomes).toHaveLength(0);
    expect(r.recurrentes).toEqual([{ label: "Aide / allocations", amount: 180, kind: "revenu" }]);
    expect(r.revenusTotal).toBe(0);
  });

  it("compare la catégorie bancaire d'un revenu planifié quand elle est renseignée", () => {
    const salaire = { id: "i2", label: "Salaire", amount: 2500, mode: "salaire", cat: "revenus-travail" };
    const ok = rowsToEntries([row({ amount: 2500, cat: "revenus-travail" })], { incomes: [salaire] });
    expect(ok.recurrentes).toHaveLength(1);
    const ko = rowsToEntries([row({ amount: 2500, cat: "virements-recus" })], { incomes: [salaire] });
    expect(ko.recurrentes).toHaveLength(0);
    expect(ko.incomes).toHaveLength(1);
  });

  it("un revenu unique planifié ne s'applique qu'à son mois", () => {
    const unique = { id: "i3", label: "Prime", amount: 500, mode: "unique", day: 15, y: 2026, m: 8 };
    const memeMois = rowsToEntries([row({ amount: 500 })], { incomes: [unique] });
    expect(memeMois.recurrentes).toHaveLength(1);
    expect(memeMois.newIncomes).toHaveLength(0);
    const autreMois = rowsToEntries([row({ amount: 500, m: 9 })], { incomes: [unique] });
    expect(autreMois.recurrentes).toHaveLength(0);
    expect(autreMois.incomes).toHaveLength(0);
    // Loyers-charges 🔁 : crédit hors écriture planifiée → revenu récurrent.
    expect(autreMois.newIncomes).toHaveLength(1);
    expect(autreMois.newIncomes[0].mode).toBe("fixe");
    expect(autreMois.couvertesIn).toBe(1);
  });

  it("sans écritures planifiées, une ligne 🔁 devient une écriture récurrente", () => {
    const { recurrentes, extras, incomes, newExpenses, couvertesOut } = rowsToEntries([row()]);
    expect(recurrentes).toHaveLength(0);
    expect(extras).toHaveLength(0);
    expect(incomes).toHaveLength(0);
    expect(newExpenses).toHaveLength(1);
    expect(newExpenses[0].amount).toBe(850);
    expect(newExpenses[0].freq).toBe("mensuelle");
    expect(newExpenses[0].incompressible).toBe(true);
    expect(couvertesOut).toBe(1);
  });
});

describe("matchesPlannedExpense / matchesPlannedIncome", () => {
  const e = { id: "x", label: "Loyer", amount: 850, cat: "logement", sub: "loyers-charges", freq: "mensuelle" };
  const r = { day: 3, m: 8, y: 2026, amount: -850, cat: "logement", sub: "loyers-charges", label: "Loyers" };

  it("match seulement à catégorie, sous-catégorie et montant identiques", () => {
    expect(matchesPlannedExpense(r, e)).toBe(true);
    expect(matchesPlannedExpense({ ...r, amount: -850.01 }, e)).toBe(true); // tolérance 0,01 €
    expect(matchesPlannedExpense({ ...r, amount: -849.90 }, e)).toBe(false);
    expect(matchesPlannedExpense({ ...r, cat: "vie-quotidienne" }, e)).toBe(false);
    expect(matchesPlannedExpense({ ...r, sub: "energie" }, e)).toBe(false);
    expect(matchesPlannedExpense({ ...r, sub: undefined }, e)).toBe(false);
  });

  it("une dépense annuelle ne matche que son mois", () => {
    const a = { ...e, freq: "annuelle", month: 9 };
    expect(matchesPlannedExpense({ ...r, m: 8 }, a)).toBe(true);
    expect(matchesPlannedExpense({ ...r, m: 5 }, a)).toBe(false);
  });

  it("match de revenu sur le montant, la catégorie éventuelle et le mode", () => {
    const fixe = { id: "y", label: "Aide", amount: 180, mode: "fixe" };
    expect(matchesPlannedIncome({ ...r, amount: 180 }, fixe)).toBe(true);
    expect(matchesPlannedIncome({ ...r, amount: 175 }, fixe)).toBe(false);
    const cat = { ...fixe, cat: "virements-recus" };
    expect(matchesPlannedIncome({ ...r, amount: 180, cat: "virements-recus" }, cat)).toBe(true);
    expect(matchesPlannedIncome({ ...r, amount: 180, cat: "virements-recus", sub: undefined }, cat)).toBe(true);
    expect(matchesPlannedIncome({ ...r, amount: 180, cat: "autre" }, cat)).toBe(false);
    const uniq = { ...fixe, mode: "unique", y: 2026, m: 8 };
    expect(matchesPlannedIncome({ ...r, amount: 180, y: 2026, m: 8 }, uniq)).toBe(true);
    expect(matchesPlannedIncome({ ...r, amount: 180, y: 2026, m: 9 }, uniq)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Colonne « Libellé opération » (v0.7.0)                              */
/* ------------------------------------------------------------------ */

describe("colonne « Libellé opération »", () => {
  /* Format détaillé : la colonne « Libellé opération » est en 3e position. */
  const DETAILLE =
    "Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;\r\n" +
    "30/09/2026;30/09/2026;PRELEVEMENT EUROPEEN DE: FREE MOBILE MANDAT FM-56688208-1;Abonnements et téléphonie;Téléphonie (fixe et mobile);-22,67;Non;\r\n" +
    "30/09/2026;30/09/2026;FRAIS PAIEMENT HORS ZONE EURO CARTE X0048 20/03 19,95 USD PAYS-BAS;Services financiers / professionnels;Frais bancaires et de gestion (dont agios);-1,35;Non;\r\n";

  it("garde l'intitulé simple (sous-catégorie) même avec un libellé d'opération", () => {
    const { rows, ignored } = parseCsv(DETAILLE);
    expect(ignored).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("Téléphonie (fixe et mobile)");
    expect(rows[1].label).toBe("Frais bancaires et de gestion (dont agios)");
    // Le rapprochement catégorie / sous-catégorie reste inchangé.
    expect(rows[0].cat).toBe("abonnements");
    expect(rows[0].sub).toBe("telephonie");
    expect(rows[1].cat).toBe("services-financiers");
    expect(rows[1].sub).toBe("frais-bancaires");
  });

  it("déduit la sous-catégorie du libellé d'opération quand la colonne est inconnue", () => {
    const csv =
      "Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;\r\n" +
      "30/09/2026;30/09/2026;PAIEMENT CARREFOUR ALIMENTATION COURSES;Vie quotidienne;Sous-catégorie Mystère;-51,20;Non;\r\n";
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].cat).toBe("vie-quotidienne");
    expect(rows[0].sub).toBe("alimentation");
    expect(rows[0].label).toBe("Alimentation");
  });

  it("sans déduction possible, retombe sur le libellé de la catégorie", () => {
    const csv =
      "Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;\r\n" +
      "30/09/2026;30/09/2026;VIREMENT INCONNU MYSTERE;Virements reçus;;250,00;Oui;\r\n";
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].sub).toBeUndefined();
    expect(rows[0].label).toBe("Virements reçus");
  });

  it("sans colonne libellé, le comportement est inchangé", () => {
    const { rows } = parseCsv(SAMPLE);
    expect(rows[0].label).toBe("Téléphonie (fixe et mobile)");
  });
});

describe("subByOperation", () => {
  it("retrouve une sous-catégorie par inclusion tolérante (accents, casse)", () => {
    expect(subByOperation("vie-quotidienne", "PAIEMENT CARREFOUR ALIMENTATION COURSES").id).toBe("alimentation");
    expect(subByOperation("vie-quotidienne", "achat vêtements et accessoires boutique").id).toBe("vetements");
  });

  it("ne retourne rien sans correspondance", () => {
    expect(subByOperation("vie-quotidienne", "AUCUN RAPPORT ICI")).toBeUndefined();
    expect(subByOperation("cat-inconnue", "ALIMENTATION")).toBeUndefined();
    expect(subByOperation("vie-quotidienne", "")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Import guidé par la nomenclature (v0.16.0)                           */
/* ------------------------------------------------------------------ */

describe("import guidé par la nomenclature (v0.16.0)", () => {
  const row = (over = {}) => ({
    day: 3, m: 8, y: 2026, amount: -850,
    cat: "logement", sub: "loyers-charges", label: "Loyers, Charges",
    ...over,
  });

  it("groupe les lignes 🔁 d'un couple : une écriture, jour le plus fréquent", () => {
    const lignes = [
      row({ day: 3 }),
      row({ day: 3 }),
      row({ day: 15 }),
      row({ day: 7 }),
    ];
    const r = rowsToEntries(lignes);
    expect(r.newExpenses).toHaveLength(1);
    expect(r.couvertesOut).toBe(4);
    expect(r.newExpenses[0].day).toBe(3); // jour le plus fréquent
    expect(r.newExpenses[0].amount).toBe(850);
    expect(r.extras).toHaveLength(0);
  });

  it("plusieurs montants pour un même couple → une écriture chacun, montant en suffixe", () => {
    const lignes = [
      row({ amount: -95.5, day: 5 }),
      row({ amount: -95.5, day: 5 }),
      row({ amount: -120, day: 12 }),
    ];
    const r = rowsToEntries(lignes);
    expect(r.newExpenses).toHaveLength(2);
    expect(r.couvertesOut).toBe(3);
    const labels = r.newExpenses.map((e) => e.label).sort();
    expect(labels).toEqual([
      "Loyers, Charges · 120,00 €",
      "Loyers, Charges · 95,50 €",
    ]);
    // Le groupe à montant unique garde le libellé simple.
    const simple = rowsToEntries([row({ amount: -120 })]);
    expect(simple.newExpenses[0].label).toBe("Loyers, Charges");
  });

  it("un crédit 🔁 devient un revenu récurrent planifié en mode fixe", () => {
    const salaire = row({
      amount: 2500, cat: "revenus-travail", sub: "salaire-fixe",
      label: "Salaire fixe", day: 28,
    });
    const r = rowsToEntries([salaire, { ...salaire, day: 27 }]);
    expect(r.newIncomes).toHaveLength(1);
    expect(r.couvertesIn).toBe(2);
    expect(r.incomes).toHaveLength(0);
    expect(r.newIncomes[0].mode).toBe("fixe");
    expect(r.newIncomes[0].amount).toBe(2500);
    expect(r.newIncomes[0].day).toBe(28);
    expect(r.newIncomes[0].cat).toBe("revenus-travail");
    expect(r.newIncomes[0].sub).toBe("salaire-fixe");
  });

  it("catégorie inconnue → couple conservé et ajouté dans « À classer »", () => {
    const csv =
      "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\n" +
      "30/09/2026;30/09/2026;Catégorie Mystère;Autre;-10,00;Non;\n" +
      "30/09/2026;30/09/2026;Catégorie Mystère;Autre;-20,00;Non;\n";
    const { rows } = parseCsv(csv);
    const r = rowsToEntries(rows);
    expect(r.taxoAdditions).toEqual([{ label: "Autre", nature: "depense" }]);
    // Les deux lignes référencent le couple ajouté, sans être récurrentes.
    expect(r.extras).toHaveLength(2);
    expect(r.extras.every((e) => e.cat === "a-classer")).toBe(true);
    expect(r.extras.every((e) => e.sub === "autre")).toBe(true);
  });

  it("sous-catégorie inconnue d'une catégorie connue → couple ajouté aussi", () => {
    const csv =
      "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\n" +
      "30/09/2026;30/09/2026;Loisirs;Sortie kayak;-42,00;Non;\n";
    const { rows } = parseCsv(csv);
    const r = rowsToEntries(rows);
    expect(r.taxoAdditions).toEqual([{ label: "Sortie kayak", nature: "depense" }]);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].cat).toBe("a-classer");
    expect(r.extras[0].sub).toBe("sortie-kayak");
  });

  it("dédoublonne les couples « À classer » par libellé, la nature du premier l'emporte", () => {
    const csv =
      "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\n" +
      "30/09/2026;30/09/2026;Divers;Divers;-10,00;Non;\n" +
      "01/10/2026;01/10/2026;Divers;divers;50,00;Non;\n";
    const { rows } = parseCsv(csv);
    const r = rowsToEntries(rows);
    expect(r.taxoAdditions).toEqual([{ label: "Divers", nature: "depense" }]);
    expect(r.extras).toHaveLength(1); // débit → dépense exceptionnelle
    expect(r.incomes).toHaveLength(1); // crédit → revenu unique
    expect(r.extras[0].sub).toBe(r.incomes[0].sub); // même couple référence
  });

  it("un couple « À classer » marqué récurrent après coup ne casse pas l'import", () => {
    // Nomenclature personnalisée : « À classer » existe déjà avec un couple 🔁.
    const taxo = [{ id: "a-classer", label: "À classer", nature: "depense", subs: [
      { id: "autre", label: "Autre", recurring: true, incompressible: true },
    ] }];
    const r = rowsToEntries([row({ cat: undefined, sub: undefined, catLabel: "Mystère", subLabel: "Autre" })], {}, taxo);
    expect(r.newExpenses).toHaveLength(1);
    expect(r.newExpenses[0].incompressible).toBe(true);
    expect(r.extras).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Rangement des couples « À classer » depuis le rapport (v0.17.0)     */
/* ------------------------------------------------------------------ */

describe("applyTaxoAdditions (v0.17.0)", () => {
  it("sans choix : crée « À classer » et y ajoute les couples", () => {
    const additions = [{ label: "Autre", nature: "depense" }];
    const { taxo, mapping } = applyTaxoAdditions(TAXONOMIE, additions);
    const cat = taxo.find((c) => c.id === A_CLASSER);
    expect(cat).toBeDefined();
    expect(cat.subs.map((s) => s.id)).toEqual(["autre"]);
    expect(mapping).toEqual([{ from: "a-classer|autre", cat: "a-classer", sub: "autre", label: "Autre" }]);
  });

  it("range un couple dans une catégorie existante, avec renommage", () => {
    const additions = [{ label: "Sortie kayak", nature: "depense" }];
    const { taxo, mapping } = applyTaxoAdditions(TAXONOMIE, additions, [{ cat: "loisirs", label: "Sports nautiques" }]);
    const loisirs = taxo.find((c) => c.id === "loisirs");
    expect(loisirs.subs.some((s) => s.label === "Sports nautiques")).toBe(true);
    expect(taxo.find((c) => c.id === A_CLASSER)).toBeUndefined();
    expect(mapping).toEqual([{ from: "a-classer|sortie-kayak", cat: "loisirs", sub: "sports-nautiques", label: "Sports nautiques" }]);
  });

  it("se rattache à une sous-catégorie existante du même libellé sans la recréer", () => {
    const additions = [{ label: "Alimentation mystère", nature: "depense" }];
    const { taxo, mapping } = applyTaxoAdditions(TAXONOMIE, additions, [{ cat: "vie-quotidienne", label: "Alimentation" }]);
    const cat = taxo.find((c) => c.id === "vie-quotidienne");
    expect(cat.subs.filter((s) => s.label === "Alimentation")).toHaveLength(1);
    expect(mapping[0].sub).toBe("alimentation");
  });

  it("se rattache à un libellé déjà présent sous un id suffixé, sans recréer", () => {
    // Cas d'une nomenclature où « Autres » existe déjà avec un id suffixé.
    const taxo = [{ id: "loisirs", label: "Loisirs", nature: "depense", env: "loisirs", subs: [
      { id: "autres-2", label: "Autres", recurring: false, incompressible: false },
    ] }];
    const additions = [{ label: "AUTRE", nature: "depense" }];
    const { taxo: out, mapping } = applyTaxoAdditions(taxo, additions, [{ cat: "loisirs", label: "Autres" }]);
    const cat = out.find((c) => c.id === "loisirs");
    expect(cat.subs).toHaveLength(1); // rien de recréé
    expect(mapping[0].sub).toBe("autres-2");
  });

  it("les écritures importées suivent le couple rangé (raccord via mapping)", () => {
    const base = migrateBase();
    const csv =
      "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\n" +
      "30/09/2026;30/09/2026;Catégorie Mystère;Autre;-10,00;Non;\n";
    const { rows } = parseCsv(csv);
    const r = rowsToEntries(rows, base);
    expect(r.taxoAdditions).toEqual([{ label: "Autre", nature: "depense" }]);
    const { taxo, mapping } = applyTaxoAdditions(TAXONOMIE, r.taxoAdditions, [{ cat: "loisirs", label: "Divers loisirs" }]);
    // L'écriture référencait a-classer|autre : elle est raccordée au couple créé.
    const m = mapping.find((x) => x.from === "a-classer|autre");
    expect(r.extras[0].cat).toBe("a-classer");
    expect(r.extras[0].sub).toBe("autre");
    const remap = (x) => (x.cat === "a-classer" && m && "a-classer|" + x.sub === m.from ? { ...x, cat: m.cat, sub: m.sub, label: m.label } : x);
    const extra = remap(r.extras[0]);
    expect(extra.cat).toBe("loisirs");
    expect(extra.sub).toBe("divers-loisirs");
    expect(extra.label).toBe("Divers loisirs");
    // La nomenclature contient bien le nouveau couple.
    expect(taxo.find((c) => c.id === "loisirs").subs.some((s) => s.id === "divers-loisirs")).toBe(true);
  });

  function migrateBase() {
    return { soldeDepart: 1500, expenses: [], incomes: [], extras: [] };
  }
});

/* ------------------------------------------------------------------ */
/* Séries temporelles 🔁 (v0.20.0) : un montant qui varie ne crée       */
/* pas d'écriture en double                                            */
/* ------------------------------------------------------------------ */

describe("séries temporelles des couples 🔁 (v0.20.0)", () => {
  const row = (over = {}) => ({
    day: 3, m: 8, y: 2026, amount: -850,
    cat: "logement", sub: "loyers-charges", label: "Loyers, Charges",
    ...over,
  });
  const salaire = (over = {}) => ({
    day: 28, m: 7, y: 2026, amount: 3622.44,
    cat: "revenus-travail", sub: "salaire-fixe", label: "Salaire fixe",
    ...over,
  });

  it("un salaire 🔁 dont le montant évolue : une seule écriture, au dernier montant observé", () => {
    const r = rowsToEntries([
      salaire(),
      salaire({ day: 27, m: 8, amount: 3450.41 }),
      salaire({ day: 26, m: 9, amount: 5204.96 }),
    ]);
    expect(r.newIncomes).toHaveLength(1); // pas trois écritures comptées chaque mois
    expect(r.newIncomes[0].amount).toBeCloseTo(5204.96); // le dernier montant observé
    expect(r.newIncomes[0].day).toBe(28); // jour le plus fréquent (premier inséré en cas d'égalité)
    expect(r.newIncomes[0].history).toHaveLength(3); // les trois occurrences conservées
    expect(r.newIncomes[0].history[2]).toEqual({ day: 26, m: 9, y: 2026, amount: 5204.96 });
    expect(r.couvertesIn).toBe(3);
    expect(r.incomes).toHaveLength(0);
  });

  it("un prélèvement 🔁 dont le montant varie : une seule écriture, au dernier montant observé", () => {
    const r = rowsToEntries([
      row({ amount: -850, m: 7 }),
      row({ amount: -870, m: 8 }),
    ]);
    expect(r.newExpenses).toHaveLength(1);
    expect(r.newExpenses[0].amount).toBe(870);
    expect(r.newExpenses[0].history).toHaveLength(2);
    expect(r.newExpenses[0].incompressible).toBe(true); // 🔒 repris de la nomenclature
  });

  it("deux prélèvements distincts d'un même couple co-occurrent le même mois : deux séries", () => {
    const r = rowsToEntries([
      row({ amount: -13 }),
      row({ amount: -13 }),
      row({ amount: -15 }),
    ]);
    expect(r.newExpenses).toHaveLength(2);
    expect(r.couvertesOut).toBe(3);
    const labels = r.newExpenses.map((e) => e.label).sort();
    expect(labels).toEqual([
      "Loyers, Charges · 13,00 €",
      "Loyers, Charges · 15,00 €",
    ]);
  });

  it("un salaire réel met à jour l'écriture « salaire » existante (rattachement, mode salaire)", () => {
    const existant = { id: "i9", label: "Salaire", amount: 2500, mode: "salaire" };
    const r = rowsToEntries([salaire({ amount: 5204.96 })], { incomes: [existant] });
    expect(r.newIncomes).toHaveLength(0); // pas de salaire en double
    expect(r.recurrentes).toEqual([{ label: "Salaire", amount: 5204.96, kind: "revenu" }]);
    expect(r.coveredHistory).toEqual([
      {
        id: "i9",
        kind: "revenu",
        obs: [{ day: 28, m: 7, y: 2026, amount: 5204.96 }],
        syncAmount: true,
      },
    ]);
  });

  it("trois salaires récents rattachés à l'écriture salaire : une seule écriture, sync vers le dernier", () => {
    const existant = { id: "i9", label: "Salaire", amount: 2500, mode: "salaire" };
    const r = rowsToEntries(
      [salaire(), salaire({ day: 27, m: 8, amount: 3450.41 }), salaire({ day: 26, m: 9, amount: 5204.96 })],
      { incomes: [existant] }
    );
    expect(r.newIncomes).toHaveLength(0);
    expect(r.recurrentes).toHaveLength(3);
    const c = r.coveredHistory[0];
    expect(c.id).toBe("i9");
    expect(c.syncAmount).toBe(true);
    expect(c.obs).toHaveLength(3);
    expect(c.obs[2]).toEqual({ day: 26, m: 9, y: 2026, amount: 5204.96 });
  });

  it("couple ambigu (plusieurs écritures planifiées, aucune rapprochée) : nouvelle écriture", () => {
    const a = { id: "a", label: "A", amount: 220, day: 5, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" };
    const b = { id: "b", label: "B", amount: 220, day: 20, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" };
    const r = rowsToEntries(
      [row({ amount: -250, cat: "vie-quotidienne", sub: "alimentation", label: "Courses" })],
      { expenses: [a, b] }
    );
    expect(r.newExpenses).toHaveLength(1);
    expect(r.newExpenses[0].amount).toBe(250);
  });

  it("le rattachement ne s'applique pas si l'écriture du couple est déjà payée ce mois-là", () => {
    const elec = { id: "e2", label: "Électricité", amount: 101.34, day: 8, cat: "logement", sub: "energie", freq: "mensuelle" };
    // Le même mois : l'ancien montant (couvert) et le nouveau (non couvert).
    const r = rowsToEntries(
      [row({ amount: -101.34, sub: "energie" }), row({ amount: -95, sub: "energie" })],
      { expenses: [elec] }
    );
    expect(r.recurrentes).toHaveLength(1); // l'ancien montant est couvert
    expect(r.newExpenses).toHaveLength(1); // le nouveau devient une écriture (ambiguïté)
    expect(r.newExpenses[0].amount).toBe(95);
  });
});

/* ------------------------------------------------------------------ */
/* Historique réel des occurrences 🔁 (v0.19.0)                        */
/* ------------------------------------------------------------------ */

describe("historique réel des occurrences 🔁", () => {
  const row = (over = {}) => ({
    day: 3, m: 8, y: 2026, amount: -850,
    cat: "logement", sub: "loyers-charges", label: "Loyers, Charges",
    ...over,
  });

  it("chaque écriture récurrente créée porte l'historique de ses occurrences", () => {
    const lignes = [
      row({ day: 3 }),
      row({ day: 5, m: 7 }),
      row({ day: 5 }),
    ];
    const r = rowsToEntries(lignes);
    expect(r.newExpenses).toHaveLength(1); // un seul couple et montant
    // les trois dates réelles sont conservées
    expect(r.newExpenses[0].history).toHaveLength(3);
    expect(r.newExpenses[0].history).toContainEqual({ day: 5, m: 7, y: 2026, amount: 850 });
    expect(r.newExpenses[0].history.every((o) => o.amount > 0)).toBe(true);
  });

  it("un revenu récurrent créé porte aussi son historique", () => {
    const salaire = row({
      amount: 2500, cat: "revenus-travail", sub: "salaire-fixe",
      label: "Salaire fixe", day: 28,
    });
    const r = rowsToEntries([salaire, { ...salaire, day: 27, m: 7 }]);
    expect(r.newIncomes).toHaveLength(1);
    expect(r.newIncomes[0].history).toHaveLength(2);
    expect(r.newIncomes[0].history).toContainEqual({ day: 27, m: 7, y: 2026, amount: 2500 });
  });

  it("une ligne couverte par une écriture planifiée alimente son historique (coveredHistory)", () => {
    const loyer = {
      id: "e1", label: "Loyer", amount: 850, day: 3,
      cat: "logement", sub: "loyers-charges", freq: "mensuelle",
    };
    const r = rowsToEntries([row(), row({ day: 5, m: 7 })], { expenses: [loyer] });
    expect(r.newExpenses).toHaveLength(0);
    expect(r.coveredHistory).toEqual([
      {
        id: "e1",
        kind: "depense",
        obs: [
          { day: 3, m: 8, y: 2026, amount: 850 },
          { day: 5, m: 7, y: 2026, amount: 850 },
        ],
      },
    ]);
  });

  it("une ligne non 🔁 consommant une écriture planifiée alimente aussi son historique", () => {
    const resto = {
      id: "r1", label: "Resto", amount: 40, day: 2,
      cat: "loisirs", sub: "restaurants", freq: "mensuelle",
    };
    const ligne = row({ amount: -40, cat: "loisirs", sub: "restaurants", label: "Restaurants, bars…" });
    const r = rowsToEntries([ligne], { expenses: [resto] });
    expect(r.recurrentes).toHaveLength(1);
    expect(r.coveredHistory).toEqual([
      { id: "r1", kind: "depense", obs: [{ day: 3, m: 8, y: 2026, amount: 40 }] },
    ]);
  });

  it("un revenu couvert par un revenu planifié alimente son historique (kind revenu)", () => {
    const aide = { id: "i1", label: "Aide / allocations", amount: 180, day: 5, mode: "fixe" };
    const r = rowsToEntries([row({ amount: 180 })], { incomes: [aide] });
    expect(r.coveredHistory).toEqual([
      { id: "i1", kind: "revenu", obs: [{ day: 3, m: 8, y: 2026, amount: 180 }] },
    ]);
  });

  it("mergeHistory déduplique par date et montant, trie par date, fusionne l'existant", () => {
    const existing = [
      { day: 5, m: 7, y: 2026, amount: 850 },
      { day: 5, m: 8, y: 2026, amount: 850 },
    ];
    const obs = [
      { day: 5, m: 8, y: 2026, amount: 850 }, // doublon exact (relevé réimporté)
      { day: 3, m: 9, y: 2026, amount: 850 },
      { day: 5, m: 8, y: 2026, amount: 870 }, // même date, montant différent : conservé
    ];
    const merged = mergeHistory(existing, obs);
    expect(merged.map((o) => o.m)).toEqual([7, 8, 8, 9]);
    expect(merged.filter((o) => o.m === 8)).toHaveLength(2); // 850 et 870
    // un même relevé réimporté n'ajoute rien
    expect(mergeHistory(merged, obs)).toHaveLength(merged.length);
  });
});

/* ------------------------------------------------------------------ */
/* Dédoublonnage multiset au réimport (v0.21.0)                        */
/* ------------------------------------------------------------------ */

describe("mergeAddedLines (dédoublonnage au réimport)", () => {
  const line = (over = {}) => ({
    id: "x1", label: "Restaurant", amount: 30, day: 5, y: 2026, m: 8,
    cat: "loisirs", sub: "restaurants", ...over,
  });

  it("réimporter un même relevé n'ajoute rien", () => {
    const added = [line(), line({ day: 12, amount: 22 })];
    expect(mergeAddedLines(added, added)).toHaveLength(0);
    expect(mergeAddedLines([line()], [line()])).toHaveLength(0);
  });

  it("les vrais doublons d'un relevé (deux opérations identiques) restent distincts", () => {
    // Deux fois -4,00 le même jour : une copie existe déjà, une seule est ajoutée.
    const dup = line({ label: "BADS", amount: 4, sub: "alimentation", cat: "vie-quotidienne" });
    expect(mergeAddedLines([dup], [dup, dup])).toHaveLength(1);
    expect(mergeAddedLines([], [dup, dup])).toHaveLength(2);
  });

  it("même jour et montant, libellé différent : conservé (opérations distinctes)", () => {
    const a = line({ label: "Chez Marcel" });
    const b = line({ label: "Chez Léon" });
    expect(mergeAddedLines([a], [b])).toHaveLength(1);
  });

  it("un mois nouveau du même couple est ajouté intégralement", () => {
    expect(mergeAddedLines([line()], [line({ m: 9, day: 7 })])).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Réimport des séries 🔁 à montant variable (v0.21.0)                 */
/* ------------------------------------------------------------------ */

describe("réimport d'une série 🔁 à montant variable", () => {
  const row = (over = {}) => ({
    day: 3, m: 8, y: 2026, amount: -850,
    cat: "logement", sub: "loyers-charges", label: "Loyers, Charges",
    ...over,
  });

  it("tous les mois déjà dans l'historique → rattachement, aucune écriture en double", () => {
    const rows = [
      row({ m: 6, amount: -800 }),
      row({ m: 7, amount: -850 }),
      row({ m: 8, amount: -900 }),
    ];
    const first = rowsToEntries(rows, {});
    expect(first.newExpenses).toHaveLength(1);
    const entry = first.newExpenses[0];
    expect(entry.amount).toBe(900);
    expect(entry.history).toHaveLength(3);

    // Réimport du même relevé, l'écriture existe maintenant avec son historique.
    const second = rowsToEntries(rows, { expenses: [entry] });
    expect(second.newExpenses).toHaveLength(0); // rattachée, pas dupliquée
    expect(second.coveredHistory).toHaveLength(1);
    expect(second.coveredHistory[0].id).toBe(entry.id);
    expect(second.coveredHistory[0].obs).toHaveLength(3);
  });

  it("un mois nouveau au montant inconnu reste rattaché avec synchronisation", () => {
    const rows = [
      row({ m: 6, amount: -800 }),
      row({ m: 7, amount: -850 }),
    ];
    const first = rowsToEntries(rows, {});
    const entry = first.newExpenses[0]; // montant prévisionnel 850
    // Relevé suivant : le mois nouveau (septembre) porte un montant inconnu.
    const next = rowsToEntries(
      [row({ m: 8, day: 5, amount: -920 })],
      { expenses: [entry] }
    );
    expect(next.newExpenses).toHaveLength(0);
    const c = next.coveredHistory[0];
    expect(c.syncAmount).toBe(true);
    expect(c.obs).toEqual([{ day: 5, m: 8, y: 2026, amount: 920 }]);
  });
});

/* ------------------------------------------------------------------ */
/* v0.24 — Heuristique libellés épargne (Livret A, CSL, PEL…)          */
/* ------------------------------------------------------------------ */

describe("import CSV — virements d'épargne ⇄", () => {
  const head = "Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;";

  it("libellé « Livret A » inconnu → couple transfert epargne/epargne-bancaire (versement)", () => {
    const csv = head + "\n05/10/2026;05/10/2026;VIREMENT EMIS LIVRET A;Non catégorisée;;-3000,00;Oui;\n";
    const { rows } = parseCsv(csv);
    expect(rows[0].cat).toBe("epargne");
    expect(rows[0].sub).toBe("epargne-bancaire");
  });

  it("libellé « CSL » inconnu, crédit → couple transfert revenus-epargne/autres (retrait)", () => {
    const csv = head + "\n05/10/2026;05/10/2026;VIR RECU CSL;Non catégorisée;;+1500,00;Oui;\n";
    const { rows } = parseCsv(csv);
    expect(rows[0].cat).toBe("revenus-epargne");
    expect(rows[0].sub).toBe("autres");
  });

  it("un couple déjà catégorisé n'est PAS réécrit par l'heuristique", () => {
    const csv = head + "\n05/10/2026;05/10/2026;VIREMENT LIVRET A;Loisirs;Restaurants, bars, discothèques…;-30,00;Oui;\n";
    const { rows } = parseCsv(csv);
    expect(rows[0].cat).toBe("loisirs");
    expect(rows[0].sub).toBe("restaurants");
  });

  it("une ligne sans libellé d'épargne reste inchangée (Non catégorisée)", () => {
    const csv = head + "\n05/10/2026;05/10/2026;PRELEVEMENT EUROPEEN;Non catégorisée;;-69,21;Oui;\n";
    const { rows } = parseCsv(csv);
    expect(rows[0].cat).toBeUndefined();
  });

  it("EPARGNE_LABEL_RE reconnaît CSL, Compte sur Livret et PEL, ignore les autres libellés", () => {
    expect(EPARGNE_LABEL_RE.test("VIR EMIS CSL")).toBe(true);
    expect(EPARGNE_LABEL_RE.test("Compte sur Livret")).toBe(true);
    expect(EPARGNE_LABEL_RE.test("PEL 1234")).toBe(true);
    expect(EPARGNE_LABEL_RE.test("LIVRET A")).toBe(true);
    expect(EPARGNE_LABEL_RE.test("RESTO CHEZ PAUL")).toBe(false);
    expect(EPARGNE_LABEL_RE.test("COURS DE NATATION PISCINE")).toBe(false);
  });
});
