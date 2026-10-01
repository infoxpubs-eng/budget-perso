import { describe, it, expect } from "vitest";
import {
  CATS,
  daysInMonth,
  monthLabel,
  freqInMonth,
  transactionsOfMonth,
  simulate,
  expensesByCat,
} from "./budget.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// État de référence utilisé par plusieurs tests.
function baseState() {
  return {
    soldeDepart: 1000,
    expenses: [
      { id: "e1", label: "Loyer", amount: 800, day: 3, cat: "domestiques", freq: "mensuelle" },
      { id: "e2", label: "Courses", amount: 200, day: 15, cat: "habituelles", freq: "mensuelle" },
      { id: "e3", label: "Vacances", amount: 900, day: 10, cat: "voyages", freq: "annuelle", month: 7 },
    ],
    incomes: [
      { id: "i1", label: "Salaire", amount: 2000, day: 27, freq: "mensuelle" },
    ],
    budgets: {},
  };
}

/* ------------------------------------------------------------------ */
/* daysInMonth                                                         */
/* ------------------------------------------------------------------ */

describe("daysInMonth", () => {
  it("donne le bon nombre de jours pour un mois classique", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // janvier
    expect(daysInMonth(2026, 3)).toBe(30); // avril
  });

  it("gère les années bissextiles", () => {
    expect(daysInMonth(2024, 1)).toBe(29); // février 2024
    expect(daysInMonth(2026, 1)).toBe(28); // février 2026
    expect(daysInMonth(2000, 1)).toBe(29); // 2000 est bissextile
    expect(daysInMonth(1900, 1)).toBe(28); // 1900 ne l'est pas
  });
});

/* ------------------------------------------------------------------ */
/* monthLabel / freqInMonth                                            */
/* ------------------------------------------------------------------ */

describe("monthLabel", () => {
  it("affiche le libellé du mois et l'année", () => {
    expect(monthLabel(2026, 9)).toBe("Octobre 2026");
  });
});

describe("freqInMonth", () => {
  it("inclut toujours les écritures mensuelles", () => {
    expect(freqInMonth("mensuelle", undefined, 5)).toBe(true);
  });

  it("n'inclut une annuelle que dans son mois", () => {
    expect(freqInMonth("annuelle", 7, 6)).toBe(true);  // juillet -> m = 6
    expect(freqInMonth("annuelle", 7, 5)).toBe(false); // juin -> exclue
  });
});

/* ------------------------------------------------------------------ */
/* transactionsOfMonth                                                */
/* ------------------------------------------------------------------ */

describe("transactionsOfMonth", () => {
  it("retourne les dépenses en négatif et les revenus en positif, triés par jour", () => {
    const tx = transactionsOfMonth(baseState(), 2026, 0); // janvier
    expect(tx.map((t) => t.day)).toEqual([3, 15, 27]);
    const loyer = tx.find((t) => t.label === "Loyer");
    const salaire = tx.find((t) => t.label === "Salaire");
    expect(loyer.amount).toBe(-800);
    expect(loyer.type).toBe("out");
    expect(salaire.amount).toBe(2000);
    expect(salaire.type).toBe("in");
  });

  it("exclut les dépenses annuelles hors de leur mois", () => {
    const txJan = transactionsOfMonth(baseState(), 2026, 0);
    expect(txJan.some((t) => t.label === "Vacances")).toBe(false);
    const txJuillet = transactionsOfMonth(baseState(), 2026, 6);
    expect(txJuillet.some((t) => t.label === "Vacances")).toBe(true);
  });

  it("ramène le jour 31 au dernier jour d'un mois de 30 jours", () => {
    const state = baseState();
    state.expenses.push({ id: "e4", label: "Assurance", amount: 50, day: 31, cat: "habituelles", freq: "mensuelle" });
    const tx = transactionsOfMonth(state, 2026, 3); // avril (30 jours)
    expect(tx.find((t) => t.label === "Assurance").day).toBe(30);
  });
});

/* ------------------------------------------------------------------ */
/* simulate                                                            */
/* ------------------------------------------------------------------ */

describe("simulate", () => {
  it("produit 12 mois enchaînés", () => {
    const sims = simulate(baseState(), 2026, 0);
    expect(sims).toHaveLength(12);
    expect(sims[0].label).toBe("Janvier 2026");
    expect(sims[11].label).toBe("Décembre 2026");
  });

  it("démarre au solde de départ et reporte le solde d'un mois sur l'autre", () => {
    const sims = simulate(baseState(), 2026, 0);
    expect(sims[0].start).toBe(1000);
    expect(sims[1].start).toBe(sims[0].end);
    expect(sims[5].start).toBe(sims[4].end);
  });

  it("calcule correctement les totaux et le solde de fin de mois", () => {
    const state = baseState();
    const sims = simulate(state, 2026, 0);
    const janv = sims[0];
    expect(janv.totalIn).toBe(2000);
    expect(janv.totalOut).toBe(1000); // loyer + courses, pas les vacances
    expect(janv.end).toBe(1000 + 2000 - 1000);
    expect(janv.end).toBe(janv.start + janv.totalIn - janv.totalOut);
  });

  it("applique la dépense annuelle uniquement dans son mois", () => {
    const sims = simulate(baseState(), 2026, 0);
    const juin = sims[5];
    const juillet = sims[6];
    expect(juin.totalOut).toBe(1000);
    expect(juillet.totalOut).toBe(1000 + 900);
    // Le solde de fin de juillet reflète la dépense annuelle
    expect(juillet.end).toBe(juillet.start + juillet.totalIn - juillet.totalOut);
  });

  it("fournit une série quotidienne complète (jour 0 = solde initial)", () => {
    const sims = simulate(baseState(), 2026, 0); // janvier = 31 jours
    const daily = sims[0].daily;
    expect(daily).toHaveLength(32); // +1 pour le jour 0
    expect(daily[0].solde).toBe(1000);
    expect(daily[31].solde).toBe(sims[0].end);
  });

  it("détecte le point le plus bas et son jour (risque de découvert)", () => {
    const state = baseState();
    state.soldeDepart = 100;
    state.expenses.push({ id: "e5", label: "Imprévu", amount: 300, day: 5, cat: "domestiques", freq: "mensuelle" });
    // J3 : 100 - 800 = -700 ; J5 : -1000 ; J15 : -1200 (le point bas) ; J27 : +800
    const sims = simulate(state, 2026, 0);
    const janv = sims[0];
    expect(janv.min).toBe(-1200);
    expect(janv.minDay).toBe(15);
    expect(janv.min).toBe(janv.daily[15].solde);
    expect(janv.min).toBeLessThan(0);
  });

  it("sait traverser le changement d'année (départ en novembre)", () => {
    const sims = simulate(baseState(), 2026, 10); // novembre 2026
    expect(sims[1].label).toBe("Décembre 2026");
    expect(sims[2].label).toBe("Janvier 2027");
    expect(sims[2].y).toBe(2027);
  });
});

/* ------------------------------------------------------------------ */
/* expensesByCat                                                       */
/* ------------------------------------------------------------------ */

describe("expensesByCat", () => {
  it("regroupe les dépenses mensuelles du mois par catégorie", () => {
    const state = baseState();
    const byCat = expensesByCat(state.expenses, 0); // janvier
    expect(byCat.domestiques).toBe(800);
    expect(byCat.habituelles).toBe(200);
    expect(byCat.voyages).toBe(0); // annuelle, pas en janvier
  });

  it("inclut les dépenses annuelles dans leur mois", () => {
    const state = baseState();
    const byCat = expensesByCat(state.expenses, 6); // juillet
    expect(byCat.voyages).toBe(900);
  });

  it("couvre toutes les catégories, même vides", () => {
    const byCat = expensesByCat(baseState().expenses, 0);
    expect(Object.keys(byCat).sort()).toEqual(CATS.map((c) => c.id).sort());
  });
});
