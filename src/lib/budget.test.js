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
  monthSim,
  loadedMonths,
  simStart,
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
  defaultTaxonomie,
  slugify,
  addCategory,
  addSubcategory,
  setSubFlags,
  subIncompressible,
  renameCategory,
  renameSubcategory,
  setCategoryActive,
  setSubActive,
  catByLabel,
  subByLabel,
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

/* ------------------------------------------------------------------ */
/* monthSim / loadedMonths (v0.8.0)                                    */
/* ------------------------------------------------------------------ */

describe("monthSim", () => {
  it("produit exactement le premier mois de simulate()", () => {
    const sims = simulate(baseState(), 2026, 0);
    const m = monthSim(baseState(), 2026, 0, baseState().soldeDepart);
    expect(m).toEqual(sims[0]);
  });

  it("chaîne un mois isolé au solde d'ouverture fourni", () => {
    const m = monthSim(baseState(), 2026, 0, 500);
    expect(m.start).toBe(500);
    expect(m.end).toBe(1500); // 500 − loyer 800 − courses 200 + salaire 2000
  });

  it("un mois sans écriture ne change pas le solde", () => {
    const m = monthSim({ soldeDepart: 0, expenses: [], incomes: [], extras: [], budgets: {} }, 2026, 4, 123.45);
    expect(m.end).toBeCloseTo(123.45);
    expect(m.tx).toHaveLength(0);
  });
});

describe("loadedMonths", () => {
  it("liste sans doublon les mois avec dépense exceptionnelle ou revenu unique, triés", () => {
    const st = baseState();
    st.extras = [
      { id: "x1", label: "A", amount: 10, day: 2, y: 2026, m: 8 },
      { id: "x2", label: "B", amount: 20, day: 3, y: 2026, m: 8 },
      { id: "x3", label: "C", amount: 30, day: 4, y: 2025, m: 11 },
    ];
    st.incomes = [...st.incomes, { id: "u1", label: "Prime", amount: 100, mode: "unique", day: 5, y: 2026, m: 11 }];
    expect(loadedMonths(st)).toEqual([
      { y: 2025, m: 11 },
      { y: 2026, m: 8 },
      { y: 2026, m: 11 },
    ]);
  });

  it("retourne une liste vide sans données chargées", () => {
    expect(loadedMonths(baseState())).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* simStart / simulate(…, opening) (v0.10.0)                            */
/* ------------------------------------------------------------------ */

describe("simStart", () => {
  it("retourne le mois de départ par défaut sans mois chargé antérieur", () => {
    expect(simStart(baseState(), 2026, 9)).toEqual({ y: 2026, m: 9 });
  });

  it("retourne le mois chargé le plus ancien s'il précède le mois courant", () => {
    const st = baseState();
    st.extras = [
      { id: "x1", label: "A", amount: 10, day: 2, y: 2026, m: 8 },
      { id: "x2", label: "B", amount: 5, day: 3, y: 2026, m: 5 },
    ];
    expect(simStart(st, 2026, 9)).toEqual({ y: 2026, m: 5 });
  });

  it("ignore les mois chargés postérieurs ou égaux au mois courant", () => {
    const st = baseState();
    st.extras = [{ id: "x", label: "A", amount: 10, day: 2, y: 2027, m: 0 }];
    expect(simStart(st, 2026, 9)).toEqual({ y: 2026, m: 9 });
  });
});

describe("simulate — solde d'ouverture explicite", () => {
  it("ouvre le premier mois sur l'ouverture fournie et enchaîne", () => {
    const sims = simulate(baseState(), 2026, 0, 500);
    expect(sims[0].start).toBe(500);
    expect(sims[1].start).toBe(sims[0].end);
  });

  it("défaut : ouverture sur le solde de départ", () => {
    expect(simulate(baseState(), 2026, 0)[0].start).toBe(1000);
  });

  it("enchaîner monthSim à la main donne la même simulation", () => {
    const sims = simulate(baseState(), 2026, 0, 300);
    const m0 = monthSim(baseState(), 2026, 0, 300);
    const m1 = monthSim(baseState(), 2026, 1, m0.end);
    expect(m1.start).toBe(sims[1].start);
    expect(m1.end).toBe(sims[1].end);
  });
});

describe("console d'administration — nomenclature dynamique", () => {
  it("slugify produit un identifiant technique robuste", () => {
    expect(slugify("Énergie & chauffage")).toBe("energie-chauffage");
    expect(slugify("  Frais de garde d'enfants ")).toBe("frais-de-garde-d-enfants");
    expect(slugify("???")).toBe("cat");
  });

  it("defaultTaxonomie renvoie une copie indépendante", () => {
    const t = defaultTaxonomie();
    expect(t.length).toBe(TAXONOMIE.length);
    t[0].subs[0].label = "MODIFIÉ";
    expect(TAXONOMIE[0].subs[0].label).not.toBe("MODIFIÉ");
  });

  it("addCategory ajoute une catégorie avec identifiant unique", () => {
    const t = defaultTaxonomie();
    const next = addCategory(t, { label: "Assurance vie", nature: "depense", env: "domestiques" });
    const added = next[next.length - 1];
    expect(added.id).toBe("assurance-vie");
    expect(added.subs).toHaveLength(0);
    expect(next.length).toBe(t.length + 1);
    expect(t.length).toBe(TAXONOMIE.length); // pure : l'original est intact
  });

  it("addCategory refuse un libellé vide ou déjà existant (tolérant aux accents)", () => {
    const t = defaultTaxonomie();
    expect(() => addCategory(t, { label: "  " })).toThrow();
    expect(() => addCategory(t, { label: "Logement" })).toThrow();
    expect(() => addCategory(t, { label: "LOGEMENT" })).toThrow();
  });

  it("addSubcategory ajoute un couple avec ses indicateurs", () => {
    const t = defaultTaxonomie();
    const next = addSubcategory(t, "logement", {
      label: "Taxe foncière",
      recurring: true,
      incompressible: true,
    });
    const sub = taxSub("logement", "taxe-fonciere", next);
    expect(sub.label).toBe("Taxe foncière");
    expect(sub.recurring).toBe(true);
    expect(sub.incompressible).toBe(true);
  });

  it("addSubcategory déduit les identifiants en collision et rejette les doublons", () => {
    const t = addSubcategory(defaultTaxonomie(), "logement", { label: "Assurance" });
    const t2 = addSubcategory(t, "logement", { label: "Assurance habitation" });
    expect(taxSub("logement", "assurance", t2)).toBeTruthy();
    expect(taxSub("logement", "assurance-habitation", t2)).toBeTruthy();
    expect(() => addSubcategory(t2, "logement", { label: "ASSURANCE" })).toThrow();
    expect(() => addSubcategory(t2, "catégorie-inconnue", { label: "X" })).toThrow();
  });

  it("addSubcategory permet de redéfinir la nature (remboursement)", () => {
    const next = addSubcategory(defaultTaxonomie(), "logement", {
      label: "Remboursement travaux",
      nature: "revenu",
    });
    const cat = taxCat("logement", next);
    const sub = taxSub("logement", "remboursement-travaux", next);
    expect(subNatureOf(cat, sub)).toBe("revenu");
  });

  it("setSubFlags bascule les indicateurs sans toucher au reste", () => {
    const next = setSubFlags(defaultTaxonomie(), "vie-quotidienne", "alimentation", {
      recurring: true,
      incompressible: false,
    });
    expect(subIncompressible("vie-quotidienne", "alimentation", next)).toBe(false);
    expect(taxSub("vie-quotidienne", "alimentation", next).recurring).toBe(true);
    expect(() => setSubFlags(next, "vie-quotidienne", "inconnue", { recurring: false, incompressible: false })).toThrow();
  });

  it("migrateState fournit et normalise la nomenclature de l'état", () => {
    const s1 = migrateState({ soldeDepart: 0 });
    expect(Array.isArray(s1.taxonomie)).toBe(true);
    expect(s1.taxonomie.length).toBe(TAXONOMIE.length);
    // taxonomie personnalisée préservée, indicateurs ramenés à des booléens
    const custom = addSubcategory(defaultTaxonomie(), "logement", {
      label: "Test admin",
      incompressible: "oui",
    });
    const s2 = migrateState({ taxonomie: custom });
    expect(s2.taxonomie.length).toBe(custom.length);
    expect(taxSub("logement", "test-admin", s2.taxonomie).incompressible).toBe(true);
    // structure invalide → nomenclature par défaut
    const s3 = migrateState({ taxonomie: "pas une liste" });
    expect(s3.taxonomie.length).toBe(TAXONOMIE.length);
  });

  it("une sous-catégorie marquée incompressible rend ses dépenses incompressibles", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [
        { id: "e1", label: "Courses", amount: 200, day: 5, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" },
      ],
    });
    const before = monthlyExpenses(st, 2026, 0);
    expect(before.incompressible).toBe(0);
    st.taxonomie = setSubFlags(st.taxonomie, "vie-quotidienne", "alimentation", {
      recurring: false,
      incompressible: true,
    });
    const after = monthlyExpenses(st, 2026, 0);
    expect(after.incompressible).toBe(200);
    expect(after.discretionnaire).toBe(0);
    // l'opération du mois porte aussi le marqueur 🔒
    const tx = transactionsOfMonth(st, 2026, 0);
    expect(tx[0].inc).toBe(true);
  });

  it("les fonctions de recherche utilisent la nomenclature de l'état", () => {
    const custom = addCategory(defaultTaxonomie(), { label: "Assurance vie", env: "domestiques" });
    const withSub = addSubcategory(custom, "assurance-vie", { label: "Frais de contrat" });
    expect(taxCat("assurance-vie", withSub).label).toBe("Assurance vie");
    expect(depenseCats(withSub).some((c) => c.id === "assurance-vie")).toBe(true);
    expect(envelopeOf("assurance-vie", "frais-de-contrat", withSub)).toBe("domestiques");
    expect(revenuOptions(withSub).length).toBe(revenuOptions(TAXONOMIE).length);
  });
});

function subNatureOf(cat, sub) {
  return sub.nature ?? cat.nature;
}

describe("console d'administration — renommage et désactivation", () => {
  it("renameCategory renomme sans changer l'identifiant et refuse les doublons", () => {
    const next = renameCategory(defaultTaxonomie(), "logement", "Habitation");
    expect(taxCat("logement", next).label).toBe("Habitation");
    expect(taxCat("logement", next).subs.length).toBe(6); // identifiant et sous-catégories inchangés
    expect(() => renameCategory(next, "logement", "Loisirs")).toThrow();
    expect(() => renameCategory(next, "logement", "  ")).toThrow();
    expect(() => renameCategory(next, "inconnu", "X")).toThrow();
  });

  it("renameSubcategory refuse le doublon dans la catégorie, l'autorise ailleurs", () => {
    const t = defaultTaxonomie();
    expect(() => renameSubcategory(t, "logement", "loyers-charges", "Énergie (électricité, gaz, fuel, chauffage…)")).toThrow();
    const next = renameSubcategory(t, "logement", "loyers-charges", "Loyer et charges");
    expect(taxSub("logement", "loyers-charges", next).label).toBe("Loyer et charges");
    // même libellé dans une autre catégorie : permis
    const next2 = renameSubcategory(t, "sante", "pharmacie", "Loyers, Charges");
    expect(taxSub("sante", "pharmacie", next2).label).toBe("Loyers, Charges");
  });

  it("setCategoryActive / setSubActive basculent l'état actif", () => {
    const t = setCategoryActive(defaultTaxonomie(), "loisirs", false);
    expect(taxCat("loisirs", t).active).toBe(false);
    const t2 = setSubActive(t, "loisirs", "restaurants", false);
    expect(taxSub("loisirs", "restaurants", t2).active).toBe(false);
    expect(() => setCategoryActive(t2, "inconnu", true)).toThrow();
    expect(() => setSubActive(t2, "loisirs", "inconnue", true)).toThrow();
  });

  it("depenseCats et revenuOptions excluent les éléments désactivés", () => {
    let t = setCategoryActive(defaultTaxonomie(), "loisirs", false);
    t = setSubActive(t, "logement", "travaux", false);
    const cats = depenseCats(t);
    expect(cats.some((c) => c.id === "loisirs")).toBe(false);
    expect(cats.find((c) => c.id === "logement").subs.some((s) => s.id === "travaux")).toBe(false);
    expect(revenuOptions(t).some((o) => o.value.startsWith("loisirs|"))).toBe(false);
  });

  it("la reconnaissance CSV ignore les catégories et sous-catégories désactivées", () => {
    let t = setCategoryActive(defaultTaxonomie(), "loisirs", false);
    expect(catByLabel("Loisirs", t)).toBeUndefined();
    expect(catByLabel("Loisirs")).toBeTruthy(); // nomenclature par défaut intacte
    t = setSubActive(t, "logement", "energie", false);
    expect(subByLabel("logement", "Energie (électricité, gaz, fuel, chauffage…)", t)).toBeUndefined();
    expect(subByLabel("logement", "Travaux, réparation, entretien, aménagement…", t)).toBeTruthy();
  });

  it("l'affichage des écritures existantes survit à la désactivation", () => {
    const t = setSubActive(defaultTaxonomie(), "logement", "loyers-charges", false);
    expect(labelOf("logement", "loyers-charges", t)).toBe("Logement · Loyers, Charges");
    expect(envelopeOf("logement", "loyers-charges", t)).toBe("domestiques");
  });

  it("migrateState normalise le drapeau actif (absent → actif)", () => {
    const st = migrateState({ soldeDepart: 0 });
    expect(st.taxonomie.every((c) => c.active === true)).toBe(true);
    expect(st.taxonomie.every((c) => c.subs.every((s) => s.active === true))).toBe(true);
    const st2 = migrateState({ taxonomie: setCategoryActive(st.taxonomie, "loisirs", false) });
    expect(taxCat("loisirs", st2.taxonomie).active).toBe(false);
  });

  it("une dépense d'une sous-catégorie désactivée reste comptée dans les totaux", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [
        { id: "e1", label: "Sorties", amount: 80, day: 10, cat: "loisirs", sub: "restaurants", freq: "mensuelle" },
      ],
    });
    const before = monthlyExpenses(st, 2026, 0).total;
    st.taxonomie = setCategoryActive(st.taxonomie, "loisirs", false);
    expect(monthlyExpenses(st, 2026, 0).total).toBe(before);
  });
});
