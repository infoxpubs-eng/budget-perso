import { describe, it, expect } from "vitest";
import { parseCsv, parseFrDate, parseFrAmount, rowsToEntries, matchesPlannedExpense, matchesPlannedIncome } from "./import-csv.js";
import { catByLabel, subByLabel, normalizeLabel } from "./taxonomie.js";

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

  it("ignore les lignes à catégorie inconnue, date ou montant illisibles", () => {
    const csv =
      "Date transaction;Date comptabilisation;Catégorie;Sous-Catégorie;Montant;Pointée;\n" +
      "30/09/2026;30/09/2026;Catégorie Mystère;Autre;-10,00;Non;\n" +
      "pas une date;30/09/2026;Loisirs;Restaurants, bars, discothèques…;-10,00;Non;\n" +
      "30/09/2026;30/09/2026;Loisirs;Restaurants, bars, discothèques…;gratuit;Non;\n" +
      "30/09/2026;30/09/2026;Loisirs;Restaurants, bars, discothèques…;0,00;Non;\n" +
      "01/10/2026;01/10/2026;Virements reçus;;250,00;Oui;\n";
    const { rows, ignored, categoriesInconnues } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(ignored).toBe(4);
    expect(categoriesInconnues).toEqual(["Catégorie Mystère"]);
    expect(rows[0].cat).toBe("virements-recus");
    expect(rows[0].sub).toBeUndefined();
    expect(rows[0].label).toBe("Virements reçus");
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
    const { extras, incomes, depensesTotal, revenusTotal } = rowsToEntries(rows);
    expect(extras).toHaveLength(5);
    expect(incomes).toHaveLength(2);
    expect(depensesTotal).toBeCloseTo(131.71);
    expect(revenusTotal).toBeCloseTo(2.7);

    const e = extras[0];
    expect(e.amount).toBe(22.67); // montant stocké positif
    expect(e.day).toBe(30);
    expect(e.y).toBe(2026);
    expect(e.m).toBe(8);
    expect(e.cat).toBe("abonnements");
    expect(e.sub).toBe("telephonie");

    const i = incomes[0];
    expect(i.mode).toBe("unique");
    expect(i.amount).toBe(1.35);
    expect(i.cat).toBe("services-financiers");
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
    const { extras, recurrentes, depensesTotal } = rowsToEntries([row()], { expenses: [loyer] });
    expect(extras).toHaveLength(0);
    expect(recurrentes).toEqual([{ label: "Loyer", amount: 850, kind: "depense" }]);
    expect(depensesTotal).toBe(0);
  });

  it("importe une dépense récurrente dont le montant diffère", () => {
    const elec = { ...loyer, id: "e2", sub: "energie", amount: 95 };
    const { extras, recurrentes } = rowsToEntries([row({ amount: -101.34, sub: "energie" })], { expenses: [elec] });
    expect(recurrentes).toHaveLength(0);
    expect(extras).toHaveLength(1);
    expect(extras[0].amount).toBeCloseTo(101.34);
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
    const courses = (n) => ({ id: "c" + n, label: "Courses " + n, amount: 220, day: 5, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" });
    const ligne = () => row({ amount: -220, cat: "vie-quotidienne", sub: "alimentation" });
    const r = rowsToEntries([ligne(), ligne(), ligne()], { expenses: [courses(1), courses(2)] });
    expect(r.recurrentes).toHaveLength(2);
    expect(r.extras).toHaveLength(1);
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
    const autreMois = rowsToEntries([row({ amount: 500, m: 9 })], { incomes: [unique] });
    expect(autreMois.recurrentes).toHaveLength(0);
    expect(autreMois.incomes).toHaveLength(1);
  });

  it("sans écritures planifiées, rien n'est rapproché (recurrentes vide)", () => {
    const { recurrentes, extras, incomes } = rowsToEntries([row()]);
    expect(recurrentes).toHaveLength(0);
    expect(extras).toHaveLength(1);
    expect(incomes).toHaveLength(0);
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
/* Colonne « Libellé opération » (v0.6.0)                              */
/* ------------------------------------------------------------------ */

describe("colonne « Libellé opération »", () => {
  /* Format détaillé : la colonne « Libellé opération » est en 3e position. */
  const DETAILLE =
    "Date transaction;Date comptabilisation;Libellé opération;Catégorie;Sous-Catégorie;Montant;Pointée;\r\n" +
    "30/09/2026;30/09/2026;PRELEVEMENT EUROPEEN DE: FREE MOBILE MANDAT FM-56688208-1;Abonnements et téléphonie;Téléphonie (fixe et mobile);-22,67;Non;\r\n" +
    "30/09/2026;30/09/2026;FRAIS PAIEMENT HORS ZONE EURO CARTE X0048 20/03 19,95 USD PAYS-BAS;Services financiers / professionnels;Frais bancaires et de gestion (dont agios);-1,35;Non;\r\n";

  it("utilise le libellé de l'opération comme intitulé de la ligne", () => {
    const { rows, ignored } = parseCsv(DETAILLE);
    expect(ignored).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("PRELEVEMENT EUROPEEN DE: FREE MOBILE MANDAT FM-56688208-1");
    expect(rows[1].label).toBe("FRAIS PAIEMENT HORS ZONE EURO CARTE X0048 20/03 19,95 USD PAYS-BAS");
    // Le rapprochement catégorie / sous-catégorie reste inchangé.
    expect(rows[0].cat).toBe("abonnements");
    expect(rows[0].sub).toBe("telephonie");
    expect(rows[1].cat).toBe("services-financiers");
    expect(rows[1].sub).toBe("frais-bancaires");
  });

  it("retombe sur le libellé de la sous-catégorie quand la colonne est absente", () => {
    const { rows } = parseCsv(SAMPLE);
    expect(rows[0].label).toBe("Téléphonie (fixe et mobile)");
  });

  it("retombe sur le libellé de la sous-catégorie quand le libellé est vide", () => {
    const csv = DETAILLE.replace(
      "PRELEVEMENT EUROPEEN DE: FREE MOBILE MANDAT FM-56688208-1",
      ""
    );
    const { rows } = parseCsv(csv);
    expect(rows[0].label).toBe("Téléphonie (fixe et mobile)");
  });

  it("propage le libellé de l'opération jusqu'aux écritures importées", () => {
    const { rows } = parseCsv(DETAILLE);
    const { extras, depensesTotal } = rowsToEntries(rows);
    expect(extras).toHaveLength(2);
    expect(extras[0].label).toBe("PRELEVEMENT EUROPEEN DE: FREE MOBILE MANDAT FM-56688208-1");
    expect(extras[0].amount).toBeCloseTo(22.67);
    expect(depensesTotal).toBeCloseTo(24.02);
  });
});
