import { describe, it, expect } from "vitest";
import {
  ENVELOPPES,
  LEGACY_CATS,
  daysInMonth,
  monthLabel,
  freqInMonth,
  isBusinessDay,
  lastBusinessDay,
  salaryPayDay,
  migrateState,
  transactionsOfMonth,
  simulate,
  monthlyExpenses,
} from "./budget.js";
import {
  TAXONOMIE,
  envelopeOf,
  taxCat,
  taxSub,
  depenseCats,
  revenuOptions,
  labelOf,
} from "./taxonomie.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// État de référence utilisé par plusieurs tests.
function baseState() {
  return {
    soldeDepart: 1000,
    expenses: [
      { id: "e1", label: "Loyer", amount: 800, day: 3, cat: "logement", sub: "loyers-charges", freq: "mensuelle", incompressible: true },
      { id: "e2", label: "Courses", amount: 200, day: 15, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" },
      { id: "e3", label: "Vacances", amount: 900, day: 10, cat: "voyages-transports", sub: "hebergement", freq: "annuelle", month: 7 },
    ],
    incomes: [
      { id: "i1", label: "Salaire", amount: 2000, day: 27, mode: "fixe" },
    ],
    extras: [],
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
/* Jours ouvrés et jour de paie                                        */
/* ------------------------------------------------------------------ */

describe("isBusinessDay / lastBusinessDay", () => {
  it("exclut les week-ends", () => {
    expect(isBusinessDay(new Date(2026, 9, 31))).toBe(false); // samedi 31 oct. 2026
    expect(isBusinessDay(new Date(2026, 9, 30))).toBe(true);  // vendredi
  });

  it("trouve le dernier jour ouvré du mois", () => {
    expect(lastBusinessDay(2026, 9).getDate()).toBe(30); // oct. 2026 : 31 = samedi -> 30
    expect(lastBusinessDay(2026, 1).getDate()).toBe(27); // fév. 2026 : 28 = samedi -> 27
  });
});

describe("salaryPayDay (avant-veille du dernier jour ouvré)", () => {
  it("paie 2 jours ouvrés avant le dernier jour ouvré", () => {
    expect(salaryPayDay(2026, 9)).toBe(28);  // oct. 2026 : dernier JO 30 (ven) -> 28 (mer)
    expect(salaryPayDay(2026, 11)).toBe(29); // déc. 2026 : dernier JO 31 (jeu) -> 29 (mar)
    expect(salaryPayDay(2026, 1)).toBe(25);  // fév. 2026 : dernier JO 27 (ven) -> 25 (mer)
  });

  it("franchit un week-end quand il le faut", () => {
    // nov. 2026 : dernier JO = lundi 30 ; avant-veille = jeudi 26 (week-end sauté)
    expect(salaryPayDay(2026, 10)).toBe(26);
    // août 2026 : dernier JO = lundi 31 ; avant-veille = jeudi 27
    expect(salaryPayDay(2026, 7)).toBe(27);
  });

  it("retourne toujours un jour ouvré, jamais un week-end", () => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(2027, m, salaryPayDay(2027, m));
      expect(isBusinessDay(d)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* migrateState                                                        */
/* ------------------------------------------------------------------ */

describe("migrateState", () => {
  it("complète un état ancien sans perdre les données", () => {
    const old = {
      soldeDepart: 900,
      expenses: [{ id: "a", label: "Loyer", amount: 700, day: 1, cat: "domestiques", freq: "mensuelle" }],
      incomes: [{ id: "b", label: "Salaire", amount: 2000, day: 27 }],
      budgets: { domestiques: 800 },
    };
    const s = migrateState(old);
    expect(s.soldeDepart).toBe(900);
    expect(s.expenses[0].incompressible).toBe(false);
    expect(s.incomes[0].mode).toBe("fixe");
    expect(s.incomes[0].treizieme).toBe(false);
    expect(s.incomes[0].bonus).toBe(0);
    expect(Array.isArray(s.extras)).toBe(true);
    expect(s.budgets.domestiques).toBe(800);
  });

  it("convertit les anciennes catégories plates vers la nomenclature bancaire", () => {
    const old = {
      expenses: [
        { id: "a", label: "Loyer", amount: 700, day: 1, cat: "domestiques", freq: "mensuelle" },
        { id: "b", label: "Salle de sport", amount: 30, day: 1, cat: "sports", freq: "mensuelle" },
        { id: "c", label: "Resto", amount: 40, day: 2, cat: "loisirs", freq: "mensuelle" },
      ],
      extras: [{ id: "d", label: "Imprévu", amount: 90, day: 4, y: 2026, m: 2 }],
    };
    const s = migrateState(old);
    expect(s.expenses[0].cat).toBe("logement");
    expect(s.expenses[0].sub).toBe("loyers-charges");
    expect(s.expenses[1].cat).toBe("loisirs");
    expect(s.expenses[1].sub).toBe("club");
    expect(s.expenses[2].sub).toBe("restaurants");
    // extras sans catégorie : ancien défaut "exceptionnelles" → Logement / frais exceptionnels
    expect(s.extras[0].cat).toBe("logement");
    expect(s.extras[0].sub).toBe("frais-exceptionnels");
  });

  it("ne touche pas une entrée déjà en nomenclature bancaire", () => {
    const s = migrateState({
      expenses: [{ id: "a", label: "Taxi", amount: 20, day: 3, cat: "voyages-transports", sub: "taxis", freq: "mensuelle" }],
    });
    expect(s.expenses[0].cat).toBe("voyages-transports");
    expect(s.expenses[0].sub).toBe("taxis");
  });

  it("dote les revenus d'une catégorie bancaire par défaut", () => {
    const s = migrateState({ incomes: [{ id: "x", label: "Salaire", amount: 2000, mode: "salaire" }] });
    expect(s.incomes[0].cat).toBe("revenus-travail");
    expect(s.incomes[0].sub).toBe("salaire-fixe");
  });

  it("remplit un état vide avec des valeurs sûres", () => {
    const s = migrateState(null);
    expect(s.soldeDepart).toBe(1500);
    expect(s.expenses).toEqual([]);
    expect(s.incomes).toEqual([]);
    expect(s.extras).toEqual([]);
  });

  it("devine le mode « salaire » pour un revenu sans jour fixe", () => {
    const s = migrateState({ incomes: [{ id: "x", label: "Salaire", amount: 2000 }] });
    expect(s.incomes[0].mode).toBe("salaire");
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
    expect(loyer.inc).toBe(true); // loyer marqué incompressible
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

  it("inclut une dépense exceptionnelle uniquement dans son mois précis", () => {
    const state = baseState();
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 18, y: 2026, m: 9, cat: "exceptionnelles" });
    const txOct = transactionsOfMonth(state, 2026, 9);
    expect(txOct.find((t) => t.label === "Réparation voiture").day).toBe(18);
    const txNov = transactionsOfMonth(state, 2026, 10);
    expect(txNov.some((t) => t.label === "Réparation voiture")).toBe(false);
  });

  it("verse un revenu unique uniquement dans son mois précis", () => {
    const state = baseState();
    state.incomes.push({ id: "i2", label: "Remboursement", amount: 1.35, mode: "unique", day: 30, y: 2026, m: 8, cat: "services-financiers", sub: "remboursement-frais" });
    const sept = transactionsOfMonth(state, 2026, 8);
    const oct = transactionsOfMonth(state, 2026, 9);
    const unique = sept.find((t) => t.mode === undefined && t.label === "Remboursement");
    expect(unique).toBeTruthy();
    expect(unique.day).toBe(30);
    expect(unique.amount).toBe(1.35);
    expect(oct.some((t) => t.label === "Remboursement")).toBe(false);
  });

  it("verse les salaires l'avant-veille du dernier jour ouvré", () => {
    const state = baseState();
    state.incomes = [{ id: "i1", label: "Salaire", amount: 2000, mode: "salaire" }];
    const tx = transactionsOfMonth(state, 2026, 9); // octobre 2026
    expect(tx.find((t) => t.label === "Salaire").day).toBe(salaryPayDay(2026, 9));
  });

  it("ajoute la ½ du 13ᵉ mois en juin et novembre seulement", () => {
    const state = baseState();
    state.incomes = [{ id: "i1", label: "Salaire", amount: 2000, mode: "salaire", treizieme: true }];
    const juin = transactionsOfMonth(state, 2027, 5);
    const nov = transactionsOfMonth(state, 2026, 10);
    const mars = transactionsOfMonth(state, 2027, 2);
    expect(juin.find((t) => t.label === "Salaire · 13ᵉ mois (½)").amount).toBe(1000);
    expect(nov.find((t) => t.label === "Salaire · 13ᵉ mois (½)").amount).toBe(1000);
    expect(mars.some((t) => t.label === "Salaire · 13ᵉ mois (½)")).toBe(false);
    // Versé le même jour que le salaire
    const salaireJuin = juin.find((t) => t.label === "Salaire");
    const treize = juin.find((t) => t.label === "Salaire · 13ᵉ mois (½)");
    expect(treize.day).toBe(salaireJuin.day);
  });

  it("ajoute le bonus estimé en mars seulement", () => {
    const state = baseState();
    state.incomes = [{ id: "i1", label: "Salaire", amount: 2000, mode: "salaire", bonus: 1200 }];
    const mars = transactionsOfMonth(state, 2027, 2);
    const avril = transactionsOfMonth(state, 2027, 3);
    expect(mars.find((t) => t.label === "Salaire · bonus estimé").amount).toBe(1200);
    expect(avril.some((t) => t.label === "Salaire · bonus estimé")).toBe(false);
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

  it("intègre une dépense exceptionnelle dans le mois concerné", () => {
    const state = baseState();
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 18, y: 2026, m: 9, cat: "exceptionnelles" });
    const sims = simulate(state, 2026, 0);
    const oct = sims[9];
    expect(oct.totalOut).toBe(1000 + 400);
    expect(oct.daily[18].solde).toBeLessThan(oct.daily[17].solde);
  });

  it("encaisse le 13ᵉ mois en juin et novembre dans les revenus", () => {
    const state = baseState();
    state.incomes = [{ id: "i1", label: "Salaire", amount: 2000, mode: "salaire", treizieme: true }];
    const sims = simulate(state, 2027, 5); // départ juin 2027
    const juin = sims[0];
    const nov = sims[5];
    expect(juin.totalIn).toBe(2000 + 1000);
    expect(nov.totalIn).toBe(2000 + 1000);
    expect(sims[1].totalIn).toBe(2000); // juillet : rien de plus
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
/* monthlyExpenses                                                     */
/* ------------------------------------------------------------------ */

describe("monthlyExpenses", () => {
  it("regroupe les dépenses récurrentes du mois par enveloppe", () => {
    const state = baseState();
    const agg = monthlyExpenses(state, 2026, 0); // janvier
    expect(agg.byEnv.domestiques).toBe(800); // loyer → Logement → Domestiques
    expect(agg.byEnv.habituelles).toBe(200); // courses → Vie quotidienne → Habituelles
    expect(agg.byEnv.voyages).toBe(0); // annuelle, pas en janvier
  });

  it("ventile aussi les totaux par catégorie bancaire", () => {
    const agg = monthlyExpenses(baseState(), 2026, 0);
    expect(agg.byCat.logement).toBe(800);
    expect(agg.byCat["vie-quotidienne"]).toBe(200);
    expect(agg.byCat["voyages-transports"]).toBeUndefined(); // rien ce mois-ci
    expect(agg.detail["domestiques|logement|loyers-charges"]).toBe(800);
  });

  it("range une sous-catégorie dans l'enveloppe redéfinie (club → sports)", () => {
    const state = baseState();
    state.expenses.push({ id: "e4", label: "Salle de sport", amount: 30, day: 1, cat: "loisirs", sub: "club", freq: "mensuelle" });
    state.expenses.push({ id: "e5", label: "Resto", amount: 40, day: 2, cat: "loisirs", sub: "restaurants", freq: "mensuelle" });
    const agg = monthlyExpenses(state, 2026, 0);
    expect(agg.byEnv.sports).toBe(30);
    expect(agg.byEnv.loisirs).toBe(40);
  });

  it("inclut les dépenses exceptionnelles dans l'enveloppe Exceptionnelles", () => {
    const state = baseState();
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 18, y: 2026, m: 9, cat: "auto-moto", sub: "entretien" });
    const oct = monthlyExpenses(state, 2026, 9);
    const jan = monthlyExpenses(state, 2026, 0);
    expect(oct.byEnv.exceptionnelles).toBe(400);
    expect(oct.byCat["auto-moto"]).toBe(400); // la catégorie bancaire reste visible
    expect(jan.byEnv.exceptionnelles).toBe(0);
  });

  it("sépare l'incompressible du discrétionnaire", () => {
    const state = baseState();
    state.expenses[0].incompressible = true; // loyer 800
    state.expenses[1].incompressible = false; // courses 200
    const agg = monthlyExpenses(state, 2026, 0);
    expect(agg.incompressible).toBe(800);
    expect(agg.discretionnaire).toBe(200);
    expect(agg.total).toBe(1000);
    expect(agg.incByEnv.domestiques).toBe(800);
  });

  it("couvre toutes les enveloppes, même vides", () => {
    const agg = monthlyExpenses(baseState(), 2026, 0);
    expect(Object.keys(agg.byEnv).sort()).toEqual(ENVELOPPES.map((c) => c.id).sort());
  });
});

/* ------------------------------------------------------------------ */
/* taxonomie                                                           */
/* ------------------------------------------------------------------ */

describe("taxonomie bancaire", () => {
  it("a des identifiants uniques et des sous-catégories rattachées", () => {
    const ids = TAXONOMIE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of TAXONOMIE) {
      const subIds = c.subs.map((s) => s.id);
      expect(new Set(subIds).size).toBe(subIds.length);
      for (const s of c.subs) expect(s.label).toBeTruthy();
      expect(c.nature === "depense" || c.nature === "revenu").toBe(true);
    }
  });

  it("rattache chaque catégorie de dépense à une enveloppe existante", () => {
    const envIds = new Set(ENVELOPPES.map((e) => e.id));
    for (const c of TAXONOMIE) {
      if (c.nature === "depense") {
        expect(envIds.has(envelopeOf(c.id))).toBe(true);
      }
    }
  });

  it("exclut « Remboursement impôts » des dépenses et la propose comme revenu", () => {
    const dep = depenseCats().find((c) => c.id === "impots-taxes");
    expect(dep.subs.map((s) => s.id)).toEqual(["impots-autres"]);
    const ropts = revenuOptions().map((o) => o.value);
    expect(ropts).toContain("impots-taxes|remb-impots");
    expect(ropts).toContain("revenus-travail|salaire-fixe");
    expect(ropts).toContain("virements-recus|");
  });

  it("libelle un couple catégorie / sous-catégorie", () => {
    expect(labelOf("loisirs", "restaurants")).toBe("Loisirs · Restaurants, bars, discothèques…");
    expect(labelOf("virements-recus")).toBe("Virements reçus");
    expect(labelOf("inconnu")).toBe("?");
  });

  it("correspondance des anciennes catégories : cibles valides uniquement", () => {
    for (const v of Object.values(LEGACY_CATS)) {
      expect(taxCat(v.cat)).toBeTruthy();
      expect(taxSub(v.cat, v.sub)).toBeTruthy();
    }
  });
});
