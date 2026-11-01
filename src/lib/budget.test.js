import { describe, it, expect } from "vitest";
import {
  ENVELOPPES,
  LEGACY_CATS,
  MONTHS,
  MONTHS_SHORT,
  daysInMonth,
  monthLabel,
  freqInMonth,
  isBusinessDay,
  isHoliday,
  lastBusinessDay,
  salaryPayDay,
  migrateState,
  transactionsOfMonth,
  simulate,
  monthSim,
  loadedMonths,
  savingsFlowHistory,
  hasRealData,
  realTransactionsOfMonth,
  realMonthSim,
  simStart,
  monthlyExpenses,
  isRecurringExpense,
  isRecurringIncome,
  recurringSchedule,
  recurringMonthTotals,
  refundsTotal,
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
  TAXO_FLAGS_VERSION,
  applyDefaultFlags,
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
      { id: "e3", label: "Assurance habitation", amount: 900, day: 10, cat: "logement", sub: "assurance-habitation", freq: "annuelle", month: 7 },
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

describe("Jours fériés français", () => {
  it("reconnaît les fériés fixes de 2026", () => {
    expect(isHoliday(new Date(2026, 0, 1))).toBe(true);   // Jour de l'an
    expect(isHoliday(new Date(2026, 4, 1))).toBe(true);    // 1er mai
    expect(isHoliday(new Date(2026, 4, 8))).toBe(true);    // 8 mai
    expect(isHoliday(new Date(2026, 6, 14))).toBe(true);   // 14 juillet
    expect(isHoliday(new Date(2026, 7, 15))).toBe(true);   // 15 août
    expect(isHoliday(new Date(2026, 10, 1))).toBe(true);   // Toussaint
    expect(isHoliday(new Date(2026, 10, 11))).toBe(true);  // Armistice
    expect(isHoliday(new Date(2026, 11, 25))).toBe(true);  // Noël
  });

  it("reconnaît les fériés mobiles de 2026 (Pâques le 5 avril)", () => {
    expect(isHoliday(new Date(2026, 3, 6))).toBe(true);   // lundi de Pâques
    expect(isHoliday(new Date(2026, 4, 14))).toBe(true);   // Ascension
    expect(isHoliday(new Date(2026, 4, 25))).toBe(true);   // lundi de Pentecôte
  });

  it("n'est pas férié les autres jours", () => {
    expect(isHoliday(new Date(2026, 3, 5))).toBe(false);   // dimanche de Pâques
    expect(isHoliday(new Date(2026, 4, 13))).toBe(false);  // mercredi avant l'Ascension
    expect(isHoliday(new Date(2026, 0, 2))).toBe(false);   // 2 janvier
    expect(isHoliday(new Date(2027, 2, 28))).toBe(false);  // dimanche de Pâques 2027
  });

  it("un jour ouvré exclut les week-ends et les fériés", () => {
    expect(isBusinessDay(new Date(2026, 3, 6))).toBe(false);  // lundi de Pâques
    expect(isBusinessDay(new Date(2027, 2, 29))).toBe(false); // lundi de Pâques 2027
  });

  it("dernier jour ouvré : un férié en début de mois est sans effet", () => {
    expect(lastBusinessDay(2026, 3).getDate()).toBe(30); // avril 2026 : lundi de Pâques le 6, 30 = jeudi
  });
});

describe("salaryPayDay décalé par un férié", () => {
  it("mai 2025 : l'Ascension (jeudi 29) fait reculer la paie de 28 à 27", () => {
    // dernier JO vendredi 30 ; 29 = Ascension (sauté), puis 28 (1er), 27 (2ᵉ)
    expect(salaryPayDay(2025, 4)).toBe(27);
  });

  it("mars 2027 : le lundi de Pâques (29) fait reculer la paie de 29 à 26", () => {
    // dernier JO mercredi 31 ; 30 (1er), 29 = Pâques (sauté), week-end, 26 (2ᵉ)
    expect(salaryPayDay(2027, 2)).toBe(26);
  });

  it("les mois sans férié en fin de mois sont inchangés", () => {
    expect(salaryPayDay(2026, 9)).toBe(28);  // oct. 2026
    expect(salaryPayDay(2027, 3)).toBe(28); // avril 2027 : dernier JO 30 (ven) -> 28 (mer)
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

  it("fournit les réglages du modèle prédictif par défaut (v0.22)", () => {
    const s = migrateState(null);
    expect(s.estimation).toEqual({ window: 6, presenceMin: 0.5, stat: "mediane" });
  });

  it("fusionne les réglages utilisateur du modèle et borne les valeurs", () => {
    const s = migrateState({ estimation: { window: 3, presenceMin: 0.8, stat: "moyenne" } });
    expect(s.estimation).toEqual({ window: 3, presenceMin: 0.8, stat: "moyenne" });
    const s2 = migrateState({ estimation: { window: 99, presenceMin: 2, stat: "inconnu" } });
    expect(s2.estimation).toEqual({ window: 24, presenceMin: 1, stat: "mediane" });
  });

  it("fournit les réglages de sauvegarde par défaut (auto, jamais exécutée)", () => {
    const s = migrateState({ soldeDepart: 0 });
    expect(s.backup).toEqual({ auto: true, lastAt: null });
    const s2 = migrateState({ soldeDepart: 0, backup: { auto: false, lastAt: "2026-10-31T08:00:00.000Z" } });
    expect(s2.backup).toEqual({ auto: false, lastAt: "2026-10-31T08:00:00.000Z" });
  });

  it("v0.31.1 : convertit les anciens revenus uniques sur couples de dépense en remboursements", () => {
    const s = migrateState({
      soldeDepart: 0,
      incomes: [
        { id: "i1", label: "Remboursement courses", amount: 120.87, mode: "unique", day: 21, y: 2026, m: 9, cat: "vie-quotidienne", sub: "alimentation" },
        { id: "i2", label: "Placement", amount: 1800, mode: "unique", day: 24, y: 2026, m: 8, cat: "revenus-epargne", sub: "placements" },
        { id: "i3", label: "Virement reçu", amount: 5, mode: "unique", day: 20, y: 2026, m: 9, cat: "a-classer", sub: "cfc-services" },
        { id: "i4", label: "Aide", amount: 180, mode: "fixe" },
      ],
      extras: [],
    });
    // Seul le revenu unique sur couple de dépense est converti en ↩.
    expect(s.incomes.map((i) => i.id)).toEqual(["i2", "i3", "i4"]);
    expect(s.extras).toHaveLength(1);
    expect(s.extras[0].id).toBe("i1");
    expect(s.extras[0].amount).toBe(-120.87);
    expect(s.extras[0].refund).toBe(true);
    expect(s.extras[0].cat).toBe("vie-quotidienne");
    expect(s.extras[0].sub).toBe("alimentation");
    expect(s.extras[0].day).toBe(21);
    // Idempotent : un second passage ne change rien.
    const s2 = migrateState(s);
    expect(s2.incomes.map((i) => i.id)).toEqual(["i2", "i3", "i4"]);
    expect(s2.extras).toHaveLength(1);
  });

  it("v0.31.1 : absorbe le revenu hérité quand le réimport a déjà créé le remboursement identique", () => {
    // Cas du bug v0.31.0 : un même crédit existait comme ancien revenu ET
    // comme remboursement dupliqué créé par le réimport → un seul reste.
    const s = migrateState({
      soldeDepart: 0,
      incomes: [{ id: "i1", label: "Remboursement courses", amount: 120.87, mode: "unique", day: 21, y: 2026, m: 9, cat: "vie-quotidienne", sub: "alimentation", opLabel: "VIR RECU" }],
      extras: [{ id: "x1", label: "Remboursement courses", amount: -120.87, refund: true, day: 21, y: 2026, m: 9, cat: "vie-quotidienne", sub: "alimentation", opLabel: "VIR RECU" }],
    });
    expect(s.incomes).toHaveLength(0);
    expect(s.extras).toHaveLength(1); // pas deux : le doublon disparaît
    expect(s.extras[0].amount).toBe(-120.87);
    expect(s.extras[0].refund).toBe(true);
  });

  it("v0.31.2 : absorbe le revenu hérité quand la banque a re-libellé l'opération entre deux exports", () => {
    // Le libellé du revenu hérité diffère de celui du remboursement créé par
    // le réimport : la clé étiquetée ne suffit pas, le repli sans libellé
    // (même date, même montant) doit absorber le doublon.
    const s = migrateState({
      soldeDepart: 0,
      incomes: [{ id: "i1", label: "Subvention", amount: 120.87, mode: "unique", day: 21, y: 2026, m: 9, cat: "vie-quotidienne", sub: "alimentation", opLabel: "VIR RECU DE: FEDERATION" }],
      extras: [{ id: "x1", label: "Subvention", amount: -120.87, refund: true, day: 21, y: 2026, m: 9, cat: "vie-quotidienne", sub: "alimentation", opLabel: "VIR RECU DE: FEDERATION SPORTIVE LGBT+" }],
    });
    expect(s.incomes).toHaveLength(0);
    expect(s.extras).toHaveLength(1);
    expect(s.extras[0].amount).toBe(-120.87);
    expect(s.extras[0].refund).toBe(true);
  });

  it("v0.31.2 : absorbe via la clé sans libellé quand le revenu hérité n'en a pas", () => {
    const s = migrateState({
      soldeDepart: 0,
      incomes: [{ id: "i1", label: "Remboursement", amount: 9.6, mode: "unique", day: 26, y: 2026, m: 9, cat: "vie-quotidienne", sub: "vetements" }],
      extras: [{ id: "x1", label: "Remboursement", amount: -9.6, refund: true, day: 26, y: 2026, m: 9, cat: "vie-quotidienne", sub: "vetements", opLabel: "CARTE REMBT" }],
    });
    expect(s.incomes).toHaveLength(0);
    expect(s.extras).toHaveLength(1);
  });

  it("v0.31.2 : des jumeaux légitimes re-libellés restent tous les deux", () => {
    // Deux crédits réellement distincts, même date et même montant, libellés
    // différemment : chaque revenu hérité absorbe un remboursement, aucun
    // nouveau ↩ n'est créé — les deux crédits restent représentés.
    const s = migrateState({
      soldeDepart: 0,
      incomes: [
        { id: "i1", label: "Remb A", amount: 9.6, mode: "unique", day: 26, y: 2026, m: 9, cat: "vie-quotidienne", sub: "vetements", opLabel: "REMBT 24/10" },
        { id: "i2", label: "Remb B", amount: 9.6, mode: "unique", day: 26, y: 2026, m: 9, cat: "vie-quotidienne", sub: "vetements", opLabel: "REMBT 25/10" },
      ],
      extras: [
        { id: "x1", label: "Remb", amount: -9.6, refund: true, day: 26, y: 2026, m: 9, cat: "vie-quotidienne", sub: "vetements", opLabel: "REMBT A NOUVEAU LIBELLE" },
        { id: "x2", label: "Remb", amount: -9.6, refund: true, day: 26, y: 2026, m: 9, cat: "vie-quotidienne", sub: "vetements", opLabel: "REMBT AUTRE LIBELLE" },
      ],
    });
    expect(s.incomes).toHaveLength(0);
    expect(s.extras).toHaveLength(2);
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
    expect(txJan.some((t) => t.label === "Assurance habitation")).toBe(false);
    const txJuillet = transactionsOfMonth(baseState(), 2026, 6);
    expect(txJuillet.some((t) => t.label === "Assurance habitation")).toBe(true);
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

  it("range une dépense non planifiée de la vie courante dans l'enveloppe de son couple", () => {
    const state = baseState();
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 18, y: 2026, m: 9, cat: "auto-moto", sub: "entretien" });
    const oct = monthlyExpenses(state, 2026, 9);
    const jan = monthlyExpenses(state, 2026, 0);
    const base = monthlyExpenses(baseState(), 2026, 9);
    expect(oct.byEnv.habituelles - base.byEnv.habituelles).toBe(400); // Auto et Moto → enveloppe habituelles
    expect(oct.byEnv.exceptionnelles - base.byEnv.exceptionnelles).toBe(0); // plus de fourre-tout systématique
    expect(oct.byCat["auto-moto"]).toBe(400); // la catégorie bancaire reste visible
    expect(jan.byEnv.habituelles - monthlyExpenses(baseState(), 2026, 0).byEnv.habituelles).toBe(0);
  });

  it("garde les dépenses one-shot dans l'enveloppe Exceptionnelles", () => {
    const state = baseState();
    // frais-exceptionnels est marqué one-shot dans la nomenclature de référence
    state.extras.push({ id: "x1", label: "Frais dossier ParaSystem", amount: 198, day: 2, y: 2026, m: 9, cat: "logement", sub: "frais-exceptionnels" });
    const oct = monthlyExpenses(state, 2026, 9);
    expect(oct.byEnv.exceptionnelles).toBe(198);
  });

  it("respecte le marqueur oneShot explicite d'une ligne, hérité ou surchargé", () => {
    const state = baseState();
    // ligne sans marqueur explicite : dérivé de la sous-catégorie (one-shot)
    state.extras.push({ id: "x1", label: "Ponctuel", amount: 100, day: 3, y: 2026, m: 9, cat: "logement", sub: "frais-exceptionnels" });
    // surcharge explicite : one-shot malgré un couple de vie courante
    state.extras.push({ id: "x2", label: "Achat unique", amount: 50, day: 4, y: 2026, m: 9, cat: "vie-quotidienne", sub: "alimentation", oneShot: true });
    // surcharge explicite inverse : vie courante malgré frais-exceptionnels
    state.extras.push({ id: "x3", label: "Courant", amount: 30, day: 5, y: 2026, m: 9, cat: "logement", sub: "frais-exceptionnels", oneShot: false });
    const oct = monthlyExpenses(state, 2026, 9);
    const base = monthlyExpenses(baseState(), 2026, 9);
    expect(oct.byEnv.exceptionnelles - base.byEnv.exceptionnelles).toBe(150); // x1 (dérivé) + x2 (explicite)
    expect(oct.byEnv.domestiques - base.byEnv.domestiques).toBe(30); // x3 → enveloppe de Logement
  });

  it("sépare l'incompressible du discrétionnaire", () => {
    // loyer 🔒 (marqueur dépense) vs resto sans marqueur — les défauts de la
    // nomenclature (alimentation 🔒) ne doivent pas s'appliquer ici
    const state = baseState();
    state.expenses[1] = {
      id: "e2b", label: "Resto", amount: 200, day: 15, cat: "loisirs", sub: "restaurants", freq: "mensuelle",
    };
    state.expenses[0].incompressible = true; // loyer 800
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
        { id: "e1", label: "Resto", amount: 200, day: 5, cat: "loisirs", sub: "restaurants", freq: "mensuelle" },
      ],
    });
    const before = monthlyExpenses(st, 2026, 0);
    expect(before.incompressible).toBe(0);
    st.taxonomie = setSubFlags(st.taxonomie, "loisirs", "restaurants", {
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

describe("marqueurs par défaut de la nomenclature", () => {
  it("la nomenclature de référence porte des marqueurs cohérents", () => {
    expect(taxSub("logement", "loyers-charges").recurring).toBe(true);
    expect(taxSub("logement", "loyers-charges").incompressible).toBe(true);
    expect(taxSub("abonnements", "telephonie").recurring).toBe(true);
    expect(taxSub("abonnements", "telephonie").incompressible).toBeFalsy();
    expect(taxSub("loisirs", "restaurants").recurring).toBeFalsy();
    expect(taxSub("loisirs", "restaurants").incompressible).toBeFalsy();
    expect(taxSub("revenus-travail", "salaire-fixe").recurring).toBe(true);
  });

  it("applyDefaultFlags fusionne les défauts sans rien retirer", () => {
    // copie sans marqueurs + un choix utilisateur à true conservé
    const stripped = defaultTaxonomie().map((c) => ({
      ...c,
      subs: c.subs.map((s) => {
        const { recurring, incompressible, ...rest } = s;
        return { ...rest, recurring: false, incompressible: false };
      }),
    }));
    stripped[1].subs[0].recurring = true; // alimentation : choix utilisateur
    const merged = applyDefaultFlags(stripped);
    const ali = taxSub("vie-quotidienne", "alimentation", merged);
    expect(ali.recurring).toBe(true);   // défaut OU choix utilisateur
    expect(ali.incompressible).toBe(true); // défaut ajouté
    const loy = taxSub("logement", "loyers-charges", merged);
    expect(loy.recurring).toBe(true);
    expect(loy.incompressible).toBe(true);
    const restos = taxSub("loisirs", "restaurants", merged);
    expect(restos.recurring).toBe(false); // pas de défaut → inchangé
    expect(restos.incompressible).toBe(false);
  });

  it("applyDefaultFlags ignore les catégories et sous-catégories personnalisées", () => {
    const custom = addSubcategory(defaultTaxonomie(), "logement", { label: "Frais de gardiennage", recurring: true });
    const withCustomCat = addCategory(custom, { label: "Assurance vie" });
    const merged = applyDefaultFlags(withCustomCat);
    expect(taxSub("logement", "frais-de-gardiennage", merged).recurring).toBe(true);
    expect(merged[merged.length - 1].id).toBe("assurance-vie");
  });

  it("migrateState applique les défauts une seule fois (version enregistrée)", () => {
    const legacy = migrateState({ soldeDepart: 0, taxoFlagsVersion: undefined });
    expect(legacy.taxoFlagsVersion).toBe(TAXO_FLAGS_VERSION);
    expect(taxSub("vie-quotidienne", "alimentation", legacy.taxonomie).incompressible).toBe(true);
    // au second passage : un choix contraire de l'utilisateur est respecté
    const chosen = setSubFlags(legacy.taxonomie, "vie-quotidienne", "alimentation", {
      recurring: true,
      incompressible: false,
    });
    const re = migrateState({ ...legacy, taxonomie: chosen });
    expect(taxSub("vie-quotidienne", "alimentation", re.taxonomie).incompressible).toBe(false);
  });
});


/* ------------------------------------------------------------------ */
/* Récurrence du modèle                                                */
/* ------------------------------------------------------------------ */

describe("récurrence du modèle", () => {
  it("isRecurringExpense suit le marqueur 🔁 du couple dans la nomenclature", () => {
    expect(isRecurringExpense({ freq: "mensuelle", cat: "logement", sub: "loyers-charges" })).toBe(true);
    expect(isRecurringExpense({ freq: "annuelle", cat: "logement", sub: "assurance-habitation" })).toBe(true);
    expect(isRecurringExpense({ freq: "mensuelle", cat: "loisirs", sub: "restaurants" })).toBe(false);
    expect(isRecurringExpense({ freq: "mensuelle", cat: "loisirs" })).toBe(false); // sans couple connu
    expect(isRecurringExpense({ freq: "unique", cat: "logement", sub: "loyers-charges" })).toBe(false);
  });

  it("isRecurringIncome suit le marqueur 🔁 du couple (Salaire fixe par défaut)", () => {
    expect(isRecurringIncome({ mode: "salaire" })).toBe(true); // défaut Salaire fixe 🔁
    expect(isRecurringIncome({ mode: "fixe" })).toBe(true);
    expect(isRecurringIncome({ mode: "unique" })).toBe(false);
    expect(isRecurringIncome({ mode: "fixe", cat: "revenus-epargne", sub: "placements" })).toBe(false);
  });

  it("marquer 🔁 une sous-catégorie rend ses écritures récurrentes", () => {
    const base = defaultTaxonomie();
    expect(isRecurringExpense({ freq: "mensuelle", cat: "loisirs", sub: "restaurants" }, base)).toBe(false);
    const taxo = setSubFlags(base, "loisirs", "restaurants", { recurring: true, incompressible: false });
    expect(isRecurringExpense({ freq: "mensuelle", cat: "loisirs", sub: "restaurants" }, taxo)).toBe(true);
    const taxoIn = setSubFlags(base, "revenus-epargne", "placements", { recurring: true, incompressible: false });
    expect(isRecurringIncome({ mode: "fixe", cat: "revenus-epargne", sub: "placements" }, taxoIn)).toBe(true);
  });

  it("transactionsOfMonth marque chaque opération rec (récurrent) ou non", () => {
    const state = baseState();
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 18, y: 2026, m: 0, cat: "exceptionnelles" });
    state.incomes.push({ id: "i2", label: "Remboursement", amount: 1.35, mode: "unique", day: 30, y: 2026, m: 0, cat: "services-financiers", sub: "remboursement-frais" });
    state.expenses.push({ id: "e8", label: "Resto mensuel", amount: 40, day: 5, cat: "loisirs", sub: "restaurants", freq: "mensuelle" });
    const tx = transactionsOfMonth(state, 2026, 0);
    expect(tx.find((t) => t.label === "Loyer").rec).toBe(true);
    expect(tx.find((t) => t.label === "Salaire").rec).toBe(true);
    expect(tx.find((t) => t.label === "Resto mensuel").rec).toBe(false); // couple non 🔁
    expect(tx.find((t) => t.label === "Réparation voiture").rec).toBe(false);
    expect(tx.find((t) => t.label === "Remboursement").rec).toBe(false);
    expect(tx.every((t) => typeof t.rec === "boolean")).toBe(true);
  });

  it("une dépense non récurrente (hors modèle) n'est pas planifiée", () => {
    const state = baseState();
    state.expenses.push({ id: "e9", label: "Achat isolé", amount: 120, day: 12, cat: "loisirs", freq: "unique" });
    const tx = transactionsOfMonth(state, 2026, 0);
    expect(tx.some((t) => t.label === "Achat isolé")).toBe(false);
  });

  it("le 13ᵉ mois et le bonus d'un salaire sont récurrents", () => {
    const state = baseState();
    state.incomes = [{ id: "i1", label: "Salaire", amount: 2000, mode: "salaire", treizieme: true, bonus: 500 }];
    const juin = transactionsOfMonth(state, 2026, 5);
    expect(juin.filter((t) => t.label.startsWith("Salaire")).every((t) => t.rec)).toBe(true);
    expect(juin.some((t) => t.label.includes("13ᵉ"))).toBe(true);
    const mars = transactionsOfMonth(state, 2026, 2);
    expect(mars.filter((t) => t.label.startsWith("Salaire")).every((t) => t.rec)).toBe(true);
    expect(mars.some((t) => t.label.includes("bonus"))).toBe(true);
  });

  it("recurringSchedule groupe les échéances récurrentes par jour, triées", () => {
    const state = baseState(); // Loyer le 3, Courses le 15, Salaire fixe le 27 (janvier)
    const sched = recurringSchedule(state, 2026, 0);
    expect(sched.map((d) => d.day)).toEqual([3, 15, 27]);
    expect(sched[0].ops.map((o) => o.label)).toEqual(["Loyer"]);
    expect(sched[0].total).toBe(-800);
    expect(sched[2].total).toBe(2000);
  });

  it("recurringSchedule exclut les opérations exceptionnelles et uniques", () => {
    const state = baseState();
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 3, y: 2026, m: 0, cat: "exceptionnelles" });
    state.incomes.push({ id: "i2", label: "Remboursement", amount: 1.35, mode: "unique", day: 15, y: 2026, m: 0, cat: "services-financiers", sub: "remboursement-frais" });
    const sched = recurringSchedule(state, 2026, 0);
    expect(sched.some((d) => d.ops.some((o) => o.label === "Réparation voiture"))).toBe(false);
    expect(sched.some((d) => d.ops.some((o) => o.label === "Remboursement"))).toBe(false);
  });

  it("recurringSchedule exclut les couples non marqués 🔁, marquer 🔁 les y fait entrer", () => {
    const state = baseState();
    state.expenses.push({ id: "e8", label: "Resto mensuel", amount: 40, day: 5, cat: "loisirs", sub: "restaurants", freq: "mensuelle" });
    // planifiée dans le mois (budgétée), absente de l'échéancier récurrent
    const tx = transactionsOfMonth(state, 2026, 0);
    expect(tx.some((t) => t.label === "Resto mensuel")).toBe(true);
    expect(recurringSchedule(state, 2026, 0).some((d) => d.ops.some((o) => o.label === "Resto mensuel"))).toBe(false);
    // le marqueur 🔁 du couple décide : il apparaît alors dans l'échéancier
    state.taxonomie = setSubFlags(defaultTaxonomie(), "loisirs", "restaurants", { recurring: true, incompressible: false });
    expect(recurringSchedule(state, 2026, 0).some((d) => d.ops.some((o) => o.label === "Resto mensuel"))).toBe(true);
    const t = recurringMonthTotals(state, 2026, 0);
    expect(t.count).toBe(4); // Loyer, Resto mensuel, Courses, Salaire
    expect(t.totalOut).toBe(1040);
  });

  it("migrateState ne crée jamais de dépense exceptionnelle par défaut", () => {
    const s = migrateState({ soldeDepart: 500 });
    expect(s.extras).toEqual([]);
    expect(s.incomes).toEqual([]);
  });

  it("recurringMonthTotals agrège les récurrents du mois et exclut l'exceptionnel", () => {
    const state = baseState(); // Loyer -800 le 3, Courses -200 le 15, Salaire fixe +2000 le 27
    state.extras.push({ id: "x1", label: "Réparation voiture", amount: 400, day: 20, y: 2026, m: 0, cat: "exceptionnelles" });
    state.incomes.push({ id: "i2", label: "Remboursement", amount: 1.35, mode: "unique", day: 10, y: 2026, m: 0, cat: "services-financiers", sub: "remboursement-frais" });
    const t = recurringMonthTotals(state, 2026, 0);
    expect(t.days).toBe(3);
    expect(t.count).toBe(3);
    expect(t.totalOut).toBe(1000);
    expect(t.totalIn).toBe(2000);
    expect(t.net).toBe(1000);
  });

  it("recurringMonthTotals ne compte la dépense annuelle que dans son mois", () => {
    const state = baseState(); // Assurance habitation -900 en juillet
    const jan = recurringMonthTotals(state, 2026, 0);
    const juil = recurringMonthTotals(state, 2026, 6);
    expect(jan.count).toBe(3);
    expect(juil.count).toBe(4);
    expect(juil.totalOut).toBe(1900);
  });
});

/* ------------------------------------------------------------------ */
/* Chaînage réel des mois chargés (v0.23)                              */
/* ------------------------------------------------------------------ */

describe("hasRealData / loadedMonths — données réelles", () => {
  it("hasRealData : extra, revenu unique ou occurrence d'historique", () => {
    const st = {
      expenses: [{ id: "e1", label: "Loyer", amount: 850, day: 3, cat: "logement", sub: "loyers-charges", freq: "mensuelle",
        history: [{ y: 2026, m: 7, day: 3, amount: 850 }] }],
      incomes: [],
      extras: [{ y: 2026, m: 8, day: 12, amount: 45, cat: "loisirs", sub: "restaurants", label: "Resto" }],
    };
    expect(hasRealData(st, 2026, 7)).toBe(true); // occurrence d'historique
    expect(hasRealData(st, 2026, 8)).toBe(true); // extra
    expect(hasRealData(st, 2026, 9)).toBe(false);
  });

  it("loadedMonths : un mois couvert uniquement par des occurrences 🔁 est chargé", () => {
    const st = {
      expenses: [{ id: "e1", label: "Loyer", amount: 850, day: 3, cat: "logement", sub: "loyers-charges", freq: "mensuelle",
        history: [{ y: 2026, m: 4, day: 3, amount: 850 }, { y: 2026, m: 5, day: 3, amount: 850 }] }],
      incomes: [],
      extras: [],
    };
    const loaded = loadedMonths(st);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual({ y: 2026, m: 4 });
    expect(loaded[1]).toEqual({ y: 2026, m: 5 });
  });
});

describe("realTransactionsOfMonth", () => {
  const st = () => ({
    expenses: [
      { id: "e1", label: "Loyer", amount: 850, day: 3, cat: "logement", sub: "loyers-charges", freq: "mensuelle", incompressible: true,
        history: [{ y: 2026, m: 6, day: 4, amount: 860 }] }, // occurrence réelle en juillet (m=6), montant décalé
      { id: "e2", label: "Streaming", amount: 25, day: 15, cat: "loisirs", sub: "culture", freq: "mensuelle" }, // jamais payé en juillet
    ],
    incomes: [
      { id: "i1", label: "Salaire", amount: 2500, mode: "salaire",
        history: [{ y: 2026, m: 6, day: 28, amount: 2510 }] },
    ],
    extras: [{ y: 2026, m: 6, day: 20, amount: 60, cat: "loisirs", sub: "restaurants", label: "Resto" }],
    taxonomie: TAXONOMIE,
  });

  it("mois chargé passé : uniquement le réel, occurrences à leur vraie date/montant", () => {
    const tx = realTransactionsOfMonth(st(), 2026, 6);
    // Loyer réel (860, le 4), salaire réel (2510, le 28), extra (60) — pas de Streaming, pas de planifiés
    expect(tx).toHaveLength(3);
    const loyer = tx.find((t) => t.label === "Loyer");
    expect(loyer.amount).toBe(-860);
    expect(loyer.day).toBe(4);
    expect(loyer.real).toBe(true);
    expect(tx.find((t) => t.label === "Streaming")).toBeUndefined();
    expect(tx.find((t) => t.label === "Salaire").amount).toBe(2510);
  });

  it("mois sans today : aucune écriture planifiée sans occurrence n'est inventée", () => {
    const tx = realTransactionsOfMonth(st(), 2026, 7); // août : rien de chargé
    expect(tx).toHaveLength(0);
  });

  it("mois courant (today) : le réel + la prévision des planifiées sans occurrence", () => {
    const tx = realTransactionsOfMonth(st(), 2026, 6, { today: 10 });
    // Loyer réel (occurrence) + salaire réel + extra + Streaming en prévision
    expect(tx).toHaveLength(4);
    const streaming = tx.find((t) => t.label === "Streaming");
    expect(streaming.amount).toBe(-25);
    expect(streaming.real).toBe(false);
  });

  it("mois courant : une planifiée à échéance passée sans occurrence n'est pas réinjectée au passé", () => {
    // Streaming (jour 15) sans occurrence ; aujourd'hui le 20 : le relevé
    // couvre le mois jusqu'à hier — l'échéance du 15 est passée, elle n'a pas
    // eu lieu. Elle ne doit pas creuser artificiellement les jours réels.
    const tx = realTransactionsOfMonth(st(), 2026, 6, { today: 20 });
    expect(tx.find((t) => t.label === "Streaming")).toBeUndefined();
    // Même état au 10 : l'échéance du 15 est à venir, elle est prévue.
    const tx2 = realTransactionsOfMonth(st(), 2026, 6, { today: 10 });
    expect(tx2.find((t) => t.label === "Streaming")).toBeDefined();
    // Et un planned à échéance aujourd'hui reste prévu (non encore observé)
    const st2 = { ...st(), expenses: [...st().expenses, { id: "e3", label: "Crédit", amount: 199.4, day: 20, cat: "emprunts-conso", sub: "credit-conso", freq: "mensuelle" }] };
    const tx3 = realTransactionsOfMonth(st2, 2026, 6, { today: 20 });
    expect(tx3.find((t) => t.label === "Crédit")).toBeDefined();
  });
});

describe("realMonthSim — chaînage réel", () => {
  const st = () => ({
    expenses: [
      { id: "e1", label: "Loyer", amount: 850, day: 3, cat: "logement", sub: "loyers-charges", freq: "mensuelle",
        history: [{ y: 2026, m: 3, day: 3, amount: 800 }, { y: 2026, m: 4, day: 3, amount: 820 }] },
    ],
    incomes: [],
    extras: [{ y: 2026, m: 4, day: 15, amount: 100, cat: "loisirs", sub: "restaurants", label: "Resto" }],
    taxonomie: TAXONOMIE,
  });

  it("les soldes enchaînent le réel, pas les récurrentes re-planifiées", () => {
    const avril = realMonthSim(st(), 2026, 3, 1000); // avril : −800
    expect(avril.end).toBe(200);
    expect(avril.start).toBe(1000);
    expect(avril.totalOut).toBe(800);
    const mai = realMonthSim(st(), 2026, 4, avril.end); // mai : −820 (loyer réel) − 100 (extra)
    expect(mai.end).toBe(-720);
    expect(mai.totalOut).toBe(920);
  });

  it("mois courant : realSoFar isole le cumul réel à ce jour", () => {
    const mo = realMonthSim(st(), 2026, 4, 1000, { today: 10 });
    // Le 10 : seul le loyer réel du 3 est survenu (−820) ; l'extra du 15 est à venir.
    expect(mo.realSoFar).toBe(-820);
    expect(mo.start + mo.realSoFar).toBe(180); // « solde actuel » exact
    expect(mo.end).toBe(80); // fin de mois : réel + extra
  });

  it("un mois sans données réelles reste simulé par monthSim (hors chaînage réel)", () => {
    const mo = monthSim(st(), 2026, 8, 500); // septembre : rien de chargé → loyer planifié −850
    expect(mo.end).toBe(-350);
  });

  it("un remboursement (extra négatif) crédite le solde et réduit le total des dépenses, sans jamais être un revenu", () => {
    const s = st();
    s.extras = [
      { y: 2026, m: 4, day: 15, amount: 100, cat: "loisirs", sub: "restaurants", label: "Resto" },
      { y: 2026, m: 4, day: 20, amount: -40, refund: true, cat: "loisirs", sub: "restaurants", label: "Remboursement Resto" },
    ];
    const mai = realMonthSim(s, 2026, 4, 1000);
    // −820 (loyer réel) − 100 (extra) + 40 (remboursement)
    expect(mai.end).toBe(120);
    expect(mai.totalOut).toBe(880); // 820 + 100 − 40 : net du couple
    expect(mai.totalIn).toBe(0); // jamais compté comme un revenu
    const tx = mai.tx.find((t) => t.type === "refund");
    expect(tx).toBeTruthy();
    expect(tx.amount).toBe(40);
    // Même logique en simulation planifiée (monthSim / transactionsOfMonth).
    const b = baseState();
    b.extras = [{ id: "x1", y: 2026, m: 0, day: 10, amount: -50, refund: true, cat: "vie-quotidienne", sub: "alimentation", label: "Remboursement courses" }];
    const janv = monthSim(b, 2026, 0, 500);
    // 500 − 800 (loyer) − 200 (courses) + 2000 (salaire) + 50 (remboursement)
    expect(janv.end).toBe(1550);
    expect(janv.totalOut).toBe(950);
    expect(janv.tx.find((t) => t.type === "refund")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* v0.24 — Transferts internes (virements d'épargne ⇄)                 */
/* ------------------------------------------------------------------ */

describe("transferts internes ⇄", () => {
  const stEpargne = () => ({
    soldeDepart: 10000,
    expenses: [],
    incomes: [
      { id: "i1", label: "Retrait SG", amount: 1000, mode: "unique", day: 6, y: 2026, m: 9, cat: "revenus-epargne", sub: "autres" },
    ],
    extras: [
      { id: "x1", label: "Livret A", amount: 3000, day: 5, y: 2026, m: 9, cat: "epargne", sub: "epargne-bancaire" },
    ],
  });

  it("les couples d'épargne bancaire sont marqués transfert par défaut", async () => {
    const t = await import("./taxonomie.js");
    expect(t.subTransfer("epargne", "epargne-bancaire", t.TAXONOMIE)).toBe(true);
    expect(t.subTransfer("revenus-epargne", "autres", t.TAXONOMIE)).toBe(true);
    expect(t.subTransfer("loisirs", "restaurants", t.TAXONOMIE)).toBe(false);
    expect(t.TAXO_FLAGS_VERSION).toBe(6);
  });

  it("migrateState re-applique les marqueurs ⇄ sur un ancien état", () => {
    const st = migrateState({ soldeDepart: 0, expenses: [], incomes: [], extras: [], taxoFlagsVersion: 1 });
    const cat = (st.taxonomie ?? []).find((c) => c.id === "epargne");
    const sub = cat?.subs.find((x) => x.id === "epargne-bancaire");
    expect(!!sub?.transfer).toBe(true);
    expect(st.taxoFlagsVersion).toBe(6);
  });

  it("migrateState re-applique le marqueur one-shot de la nomenclature sur un ancien état", () => {
    const st = migrateState({ soldeDepart: 0, expenses: [], incomes: [], extras: [], taxoFlagsVersion: 2 });
    const sub = (st.taxonomie ?? []).find((c) => c.id === "logement")?.subs.find((x) => x.id === "frais-exceptionnels");
    expect(!!sub?.oneShot).toBe(true);
    expect(st.taxoFlagsVersion).toBe(6);
  });

  it("v4 : l'épargne bancaire n'est plus récurrente et les séries planifiées deviennent des extras datés", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [
        {
          id: "e1",
          label: "Livret A",
          amount: 2200,
          day: 26,
          cat: "epargne",
          sub: "epargne-bancaire",
          freq: "mensuelle",
          history: [
            { y: 2026, m: 6, day: 26, amount: 2200 },
            { y: 2026, m: 9, day: 26, amount: 3000 },
          ],
        },
      ],
      incomes: [],
      extras: [],
      taxoFlagsVersion: 3,
    });
    // Le marqueur 🔁 est retiré, le ⇄ conservé
    const sub = (st.taxonomie ?? []).find((c) => c.id === "epargne")?.subs.find((x) => x.id === "epargne-bancaire");
    expect(!!sub?.recurring).toBe(false);
    expect(!!sub?.transfer).toBe(true);
    // La série planifiée disparaît…
    expect(st.expenses.some((e) => e.sub === "epargne-bancaire")).toBe(false);
    // …remplacée par une dépense non planifiée par occurrence, à l'identique
    const conv = st.extras.filter((x) => x.sub === "epargne-bancaire");
    expect(conv).toHaveLength(2);
    expect(conv[0]).toEqual({ id: "e1-epargne-2026-6-26", label: "Livret A", amount: 2200, day: 26, y: 2026, m: 6, cat: "epargne", sub: "epargne-bancaire" });
    expect(conv[1].amount).toBe(3000);
    expect(conv[1].m).toBe(9);
    // Le virement reste un transfert interne : hors budget, dans le flux d'épargne
    const sim = monthSim(st, 2026, 6, 1000);
    expect(sim.totalOut).toBe(0);
    expect(sim.transferOut).toBe(2200);
    expect(sim.fluxEpargne).toBe(2200);
  });

  it("v5 : une série planifiée observée sur un seul mois (coïncidence) redevient une dépense datée", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [
        {
          id: "p1",
          label: "Alimentation · 17,53 €",
          amount: 17.53,
          day: 4,
          cat: "vie-quotidienne",
          sub: "alimentation",
          freq: "mensuelle",
          history: [{ y: 2026, m: 6, day: 4, amount: 17.53 }],
        },
        {
          id: "p2",
          label: "Crédit conso",
          amount: 199.4,
          day: 30,
          cat: "emprunts-conso",
          sub: "credit-conso",
          freq: "mensuelle",
          history: [
            { y: 2026, m: 6, day: 30, amount: 199.4 },
            { y: 2026, m: 7, day: 30, amount: 199.4 },
          ],
        },
      ],
      incomes: [],
      extras: [],
      taxoFlagsVersion: 4,
    });
    // La coïncidence unimensuelle disparaît des planifiées…
    expect(st.expenses.map((e) => e.id)).toEqual(["p2"]);
    // …et son occurrence réelle est conservée en dépense non planifiée datée
    const conv = st.extras.find((x) => x.id === "p1-occ-2026-6-4");
    expect(conv).toEqual({ id: "p1-occ-2026-6-4", label: "Alimentation · 17,53 €", amount: 17.53, day: 4, y: 2026, m: 6, cat: "vie-quotidienne", sub: "alimentation" });
    // La série confirmée sur deux mois reste planifiée, intacte
    expect(st.expenses[0].history).toHaveLength(2);
  });

  it("v5 : une série unique d'un couple (engagement réel, ex. Crédit conso) n'est pas balayée", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [
        {
          id: "cc",
          label: "Crédit conso",
          amount: 199.4,
          day: 30,
          cat: "emprunts-conso",
          sub: "credit-conso",
          freq: "mensuelle",
          history: [{ y: 2026, m: 8, day: 30, amount: 199.4 }],
        },
      ],
      incomes: [],
      extras: [],
      taxoFlagsVersion: 4,
    });
    expect(st.expenses).toHaveLength(1);
    expect(st.expenses[0].label).toBe("Crédit conso");
    expect(st.extras).toHaveLength(0);
  });

  it("v6 : les séries alimentation confirmées sur ≥ 2 mois redeviennent des extras datés, les autres couples restent planifiés", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [
        {
          id: "a1",
          label: "Alimentation · 22,06 €",
          amount: 22.06,
          day: 12,
          cat: "vie-quotidienne",
          sub: "alimentation",
          freq: "mensuelle",
          history: [
            { y: 2026, m: 5, day: 12, amount: 22.06 },
            { y: 2026, m: 7, day: 14, amount: 22.06 },
            { y: 2026, m: 8, day: 11, amount: 22.06 },
          ],
        },
        {
          id: "t1",
          label: "Transports quotidiens (métro, bus…) · 1,70 €",
          amount: 1.7,
          day: 6,
          cat: "voyages-transports",
          sub: "quotidiens",
          freq: "mensuelle",
          history: [
            { y: 2026, m: 5, day: 6, amount: 1.7 },
            { y: 2026, m: 7, day: 9, amount: 1.7 },
          ],
        },
        {
          id: "m1",
          label: "Courses",
          amount: 200,
          day: 15,
          cat: "vie-quotidienne",
          sub: "alimentation",
          freq: "mensuelle",
        },
      ],
      incomes: [],
      extras: [],
      taxoFlagsVersion: 5,
    });
    // Les séries alimentation issues de l'import disparaissent…
    expect(st.expenses.map((e) => e.id)).toEqual(["t1", "m1"]);
    // …remplacées par leurs occurrences réelles, à l'identique
    const conv = st.extras.filter((x) => x.id.startsWith("a1-occ-"));
    expect(conv).toHaveLength(3);
    expect(conv[0]).toEqual({ id: "a1-occ-2026-5-12", label: "Alimentation · 22,06 €", amount: 22.06, day: 12, y: 2026, m: 5, cat: "vie-quotidienne", sub: "alimentation" });
    expect(conv[2].day).toBe(11);
    // Les transports quotidiens (métro, Vélib…) restent une série planifiée
    expect(st.expenses[0].history).toHaveLength(2);
    // Une écriture alimentaire créée à la main (sans historique) est conservée
    expect(st.expenses[1].label).toBe("Courses");
  });

  it("totaux budgétaires hors transferts, flux d'épargne exposé, solde exact", () => {
    const sim = monthSim(stEpargne(), 2026, 9, 10000);
    expect(sim.totalIn).toBe(0); // le retrait n'est pas un revenu budgétaire
    expect(sim.totalOut).toBe(0); // le versement n'est pas une dépense budgétaire
    expect(sim.transferIn).toBe(1000);
    expect(sim.transferOut).toBe(3000);
    expect(sim.fluxEpargne).toBe(2000); // 3000 mis de côté − 1000 repris
    expect(sim.end).toBe(8000); // le solde, lui, suit les mouvements réels
  });

  it("realMonthSim : même isolement sur les mois chargés, realSoFar inclusif", () => {
    const mo = realMonthSim(stEpargne(), 2026, 9, 10000, { today: 10 });
    expect(mo.transferIn).toBe(1000);
    expect(mo.transferOut).toBe(3000);
    expect(mo.fluxEpargne).toBe(2000);
    expect(mo.totalIn).toBe(0);
    expect(mo.totalOut).toBe(0);
    expect(mo.realSoFar).toBe(-2000); // le solde actuel intègre les transferts
    expect(mo.start + mo.realSoFar).toBe(8000);
  });

  it("monthlyExpenses exclut les versements d'épargne et expose le total transféré", () => {
    const agg = monthlyExpenses(stEpargne(), 2026, 9);
    expect(agg.total).toBe(0);
    expect(agg.transfers).toBe(3000);
  });

  it("une écriture planifiée sur un couple ⇄ est transfert, pas dépense", () => {
    const st = {
      soldeDepart: 0,
      expenses: [{ id: "e1", label: "Épargne auto", amount: 200, day: 5, cat: "epargne", sub: "epargne-bancaire", freq: "mensuelle" }],
      incomes: [],
      extras: [],
    };
    const sim = monthSim(st, 2026, 9, 1000);
    expect(sim.totalOut).toBe(0);
    expect(sim.transferOut).toBe(200);
    expect(sim.fluxEpargne).toBe(200);
    expect(sim.end).toBe(800);
    // Le mois SANS données reste simulé : l'écriture planifiée ⇄ est un transfert
    expect(hasRealData(st, 2026, 9)).toBe(false);
  });

  it("flux négatif quand la réserve est sollicitée", () => {
    const st = {
      soldeDepart: 0,
      expenses: [],
      incomes: [{ id: "i1", label: "Retrait CSL", amount: 3000, mode: "unique", day: 3, y: 2026, m: 5, cat: "revenus-epargne", sub: "autres" }],
      extras: [],
    };
    const sim = monthSim(st, 2026, 5, 100);
    expect(sim.transferIn).toBe(3000);
    expect(sim.fluxEpargne).toBe(-3000);
    expect(sim.totalIn).toBe(0); // pas de faux revenu
    expect(sim.end).toBe(3100);
  });
});

describe("savingsFlowHistory — trajectoire cumulée de l'épargne", () => {
  it("cumule les flux d'épargne réels des mois chargés, du plus ancien au plus récent", () => {
    const st = {
      expenses: [
        { id: "e1", label: "Livret A", amount: 3000, day: 26, cat: "epargne", sub: "epargne-bancaire", freq: "mensuelle",
          history: [{ y: 2026, m: 5, day: 26, amount: 3000 }] },
      ],
      incomes: [
        { id: "i1", label: "Retrait", amount: 1500, mode: "unique", y: 2026, m: 4, day: 10,
          cat: "epargne", sub: "epargne-bancaire" },
        { id: "i2", label: "Retrait", amount: 1000, mode: "unique", y: 2026, m: 7, day: 10,
          cat: "epargne", sub: "epargne-bancaire" },
      ],
      extras: [], taxonomie: defaultTaxonomie(),
    };
    const h = savingsFlowHistory(st);
    expect(h).toHaveLength(3); // mai, juin, août
    expect(h[0]).toEqual({ y: 2026, m: 4, label: "Mai 2026", versements: 0, retraits: 1500, net: -1500, cumul: -1500 });
    expect(h[1].net).toBe(3000);
    expect(h[1].cumul).toBe(1500);
    expect(h[2].net).toBe(-1000);
    expect(h[2].cumul).toBe(500);
  });

  it("aucun mois chargé → historique vide", () => {
    expect(savingsFlowHistory({ expenses: [], incomes: [], extras: [] })).toEqual([]);
  });
});

describe("MONTHS_SHORT — abréviations d'axe en 3 caractères", () => {
  it("12 abréviations de 3 caractères, toutes distinctes", () => {
    expect(MONTHS_SHORT).toHaveLength(12);
    for (const s of MONTHS_SHORT) expect(s).toHaveLength(3);
    expect(new Set(MONTHS_SHORT).size).toBe(12);
  });

  it("chaque mois a une abréviation reconnaissable (initiale du mois complet)", () => {
    MONTHS.forEach((m, i) => {
      expect(m.startsWith(MONTHS_SHORT[i][0])).toBe(true);
    });
  });

  it("mapping label de mois → abréviation utilisé par les axes", () => {
    for (let i = 0; i < 12; i++) {
      const label = monthLabel(2026, i); // ex. « Octobre 2026 »
      const short = MONTHS_SHORT[MONTHS.indexOf(label.split(" ")[0])] ?? label.split(" ")[0];
      expect(short).toHaveLength(3);
    }
  });
});

describe("refundsTotal (crédits du mois, hors revenus)", () => {
  it("additionne les crédits « refund » d'un mois réel — montants POSITIFS dans les tx", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [],
      incomes: [],
      extras: [
        { id: "r1", label: "Remb A", amount: -120.87, y: 2026, m: 8, day: 21, refund: true },
        { id: "r2", label: "Remb B", amount: -204.2, y: 2026, m: 8, day: 15, refund: true },
        { id: "d1", label: "Dép", amount: 30, y: 2026, m: 8, day: 20 },
      ],
    });
    const sim = realMonthSim(st, 2026, 8, 0);
    expect(refundsTotal(sim.tx)).toBeCloseTo(325.07);
    expect(sim.totalIn).toBeCloseTo(0);         // jamais comptés comme revenus
    expect(sim.totalOut).toBeCloseTo(-295.07); // dépenses NETTES : 30 − 325,07 (crédits en moins)
  });

  it("est nul sans remboursement (mois simulé futur)", () => {
    const st = migrateState({ soldeDepart: 0 });
    expect(refundsTotal(monthSim(st, 2026, 10, 0).tx)).toBeCloseTo(0);
  });

  it("un mois ne compte que ses propres crédits", () => {
    const st = migrateState({
      soldeDepart: 0,
      expenses: [],
      incomes: [],
      extras: [
        { id: "r1", label: "Remb sept.", amount: -100, y: 2026, m: 8, day: 10, refund: true },
        { id: "r2", label: "Remb oct.", amount: -50, y: 2026, m: 9, day: 12, refund: true },
      ],
    });
    expect(refundsTotal(realMonthSim(st, 2026, 8, 0).tx)).toBeCloseTo(100);
    expect(refundsTotal(realMonthSim(st, 2026, 9, 100).tx)).toBeCloseTo(50);
  });
});
