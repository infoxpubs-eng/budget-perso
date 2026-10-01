import { describe, it, expect } from "vitest";
import { parseCsv, parseFrDate, parseFrAmount, rowsToEntries } from "./import-csv.js";
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
