import { describe, it, expect } from "vitest";
import {
  medianOf,
  monthlySpendByCouple,
  coupleTendencies,
  remainingProvision,
  normEstimation,
  meanOf,
  DEFAULT_ESTIMATION,
  TENDENCY_WINDOW,
  PRESENCE_MIN,
} from "./estimation.js";
import { TAXONOMIE } from "./taxonomie.js";

/* Données synthétiques uniquement : m est 0-indexé (août = 7, sept = 8). */

const x = (y, m, day, amount, cat = "loisirs", sub = "restaurants", label = "Restaurant") =>
  ({ y, m, day, amount, cat, sub, label });

/* 6 mois complets : avril (3) → septembre (8) 2026, octobre (9) partiel. */
const sixMonths = [
  x(2026, 3, 5, 100), x(2026, 4, 5, 200), x(2026, 5, 5, 300),
  x(2026, 6, 5, 400), x(2026, 7, 5, 500), x(2026, 8, 5, 600),
];

describe("medianOf", () => {
  it("médiane d'un nombre impair d'éléments", () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([100, 200, 300, 400, 500])).toBe(300);
  });

  it("moyenne des deux milieux si pair ; 0 si vide", () => {
    expect(medianOf([1, 2, 3, 10])).toBe(2.5);
    expect(medianOf([])).toBe(0);
  });
});

describe("monthlySpendByCouple", () => {
  it("totalise par couple et par mois", () => {
    const by = monthlySpendByCouple([
      x(2026, 7, 2, 30), x(2026, 7, 20, 50), x(2026, 8, 4, 40),
    ]);
    const months = by.get("loisirs|restaurants");
    expect(months.get(2026 * 12 + 7)).toBe(80);
    expect(months.get(2026 * 12 + 8)).toBe(40);
  });

  it("ignore les lignes sans montant ni date valides", () => {
    const by = monthlySpendByCouple([
      { cat: "a", sub: "b" }, { y: 2026, m: 1, amount: -5, cat: "a", sub: "b" },
    ]);
    expect(by.size).toBe(0);
  });
});

describe("coupleTendencies", () => {
  it("médiane des totaux mensuels, zéros inclus", () => {
    // Présent chaque mois de la fenêtre : médiane de [100..600] = 350.
    const tend = coupleTendencies(sixMonths, { y: 2026, m: 9 });
    expect(tend).toHaveLength(1);
    expect(tend[0].tendency).toBe(350);
    expect(tend[0].windowMonths).toBe(6);
    expect(tend[0].presence).toBe(6);
  });

  it("exclut le mois cible (partiel) de la fenêtre", () => {
    // Octobre déjà dépensé ne tire pas la tendance vers le bas.
    const withOct = [...sixMonths, x(2026, 9, 1, 40)];
    const tend = coupleTendencies(withOct, { y: 2026, m: 9 });
    expect(tend[0].tendency).toBe(350);
  });

  it("fenêtre bornée aux 6 derniers mois complets", () => {
    // 8 mois avant la cible : les 2 plus anciens sortent de la fenêtre.
    const eight = [
      x(2026, 1, 5, 1000), x(2026, 2, 5, 2000),
      ...sixMonths,
    ];
    const tend = coupleTendencies(eight, { y: 2026, m: 9 });
    expect(tend[0].windowMonths).toBe(TENDENCY_WINDOW);
    expect(tend[0].tendency).toBe(350); // 1000 et 2000 ignorés
  });

  it("présence < 50 % → tendance 0 (dépense exceptionnelle)", () => {
    // Vu une seule fois sur 6 mois (fenêtre étendue par les autres couples).
    const taxis = sixMonths.map((o) => ({ ...o, cat: "voyages-transports", sub: "taxis", label: "Taxi" }));
    const tend = coupleTendencies([x(2026, 4, 5, 300), ...taxis], { y: 2026, m: 9 });
    const resto = tend.find((t) => t.sub === "restaurants");
    expect(resto.tendency).toBe(0);
    expect(resto.presence).toBe(1);
  });

  it("présence exactement 50 % → provisionnée (médiane avec les zéros)", () => {
    // Restaurants présents avril-juin, absents juillet-septembre : 3 mois sur 6.
    const taxis = [
      x(2026, 6, 5, 10, "voyages-transports", "taxis"),
      x(2026, 7, 5, 10, "voyages-transports", "taxis"),
      x(2026, 8, 5, 10, "voyages-transports", "taxis"),
    ];
    const tend = coupleTendencies(
      [x(2026, 3, 5, 100), x(2026, 4, 5, 200), x(2026, 5, 5, 300), ...taxis],
      { y: 2026, m: 9 }
    );
    const resto = tend.find((t) => t.sub === "restaurants");
    expect(resto.presence).toBe(3);
    expect(resto.tendency).toBe(50); // médiane de [100, 200, 300, 0, 0, 0]
  });

  it("dernier mois observé exposé, tri par tendance décroissante", () => {
    const tend = coupleTendencies(
      [...sixMonths, x(2026, 3, 2, 50, "vie-quotidienne", "alimentation")],
      { y: 2026, m: 9 }
    );
    expect(tend[0].sub).toBe("restaurants");
    expect(tend[0].lastMonth).toEqual({ y: 2026, m: 8 });
  });

  it("aucune donnée → tableau vide", () => {
    expect(coupleTendencies([], { y: 2026, m: 9 })).toEqual([]);
  });
});

describe("remainingProvision", () => {
  it("soustrait le déjà-dépensé du mois cible", () => {
    // Tendance 350 sur avr-sept ; 100 déjà dépensés en octobre → reste 250.
    const prov = remainingProvision({
      extras: [...sixMonths, x(2026, 9, 1, 100)],
      expenses: [],
      y: 2026, m: 9,
    });
    expect(prov.lines).toHaveLength(1);
    expect(prov.lines[0]).toEqual({ cat: "loisirs", sub: "restaurants", tendency: 350, spent: 100, left: 250 });
    expect(prov.total).toBe(250);
  });

  it("trop dépensé → restant 0, jamais négatif", () => {
    const prov = remainingProvision({
      extras: [...sixMonths, x(2026, 9, 1, 999)],
      expenses: [], y: 2026, m: 9,
    });
    expect(prov.lines[0].left).toBe(0);
    expect(prov.total).toBe(0);
  });

  it("exclut les couples portés par une écriture planifiée", () => {
    const prov = remainingProvision({
      extras: sixMonths,
      expenses: [{ id: "e1", label: "Resto", amount: 350, day: 5, cat: "loisirs", sub: "restaurants", freq: "mensuelle" }],
      y: 2026, m: 9,
    });
    expect(prov.lines).toEqual([]);
    expect(prov.total).toBe(0);
  });

  it("couple sans tendance (exceptionnel) → aucune provision", () => {
    const taxis = sixMonths.map((o) => ({ ...o, cat: "voyages-transports", sub: "taxis", label: "Taxi" }));
    const prov = remainingProvision({
      extras: [x(2026, 4, 5, 300), ...taxis],
      expenses: [], y: 2026, m: 9,
    });
    expect(prov.lines.filter((l) => l.sub === "restaurants")).toEqual([]);
  });

  it("mois futur : rien encore dépensé → provision = tendance pleine", () => {
    const prov = remainingProvision({ extras: sixMonths, expenses: [], y: 2026, m: 10 });
    expect(prov.lines[0].spent).toBe(0);
    expect(prov.lines[0].left).toBe(350);
  });

  it("cold start (aucun relevé) → provision nulle", () => {
    const prov = remainingProvision({ extras: [], expenses: [], y: 2026, m: 9 });
    expect(prov).toEqual({ lines: [], total: 0 });
  });

  it("paramètres du modèle exposés et cohérents", () => {
    expect(TENDENCY_WINDOW).toBe(6);
    expect(PRESENCE_MIN).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/* Réglages du modèle (v0.22 : fenêtre, seuil, statistique)             */
/* ------------------------------------------------------------------ */

/* Mêmes 6 mois complets, dernier mois lourd : distingue médiane/moyenne. */
const sixVar = [
  x(2026, 3, 5, 100), x(2026, 4, 5, 200), x(2026, 5, 5, 300),
  x(2026, 6, 5, 400), x(2026, 7, 5, 500), x(2026, 8, 5, 1200),
];

describe("normEstimation", () => {
  it("réglages par défaut", () => {
    expect(normEstimation()).toEqual({ window: 6, presenceMin: 0.5, stat: "mediane" });
    expect(DEFAULT_ESTIMATION).toEqual({ window: 6, presenceMin: 0.5, stat: "mediane" });
  });

  it("bornes sûres : fenêtre 1–24, présence 0–1, statistique énumérée", () => {
    expect(normEstimation({ window: 99 })).toEqual({ window: 24, presenceMin: 0.5, stat: "mediane" });
    expect(normEstimation({ window: 2.7 })).toEqual({ window: 3, presenceMin: 0.5, stat: "mediane" });
    expect(normEstimation({ window: 0 })).toEqual({ window: 6, presenceMin: 0.5, stat: "mediane" });
    expect(normEstimation({ presenceMin: 1.5 })).toEqual({ window: 6, presenceMin: 1, stat: "mediane" });
    expect(normEstimation({ presenceMin: -1 })).toEqual({ window: 6, presenceMin: 0.5, stat: "mediane" });
    expect(normEstimation({ stat: "n'importe" })).toEqual({ window: 6, presenceMin: 0.5, stat: "mediane" });
    expect(normEstimation({ stat: "moyenne" })).toEqual({ window: 6, presenceMin: 0.5, stat: "moyenne" });
  });
});

describe("réglages — statistique de tendance", () => {
  it("moyenne : suit les gros mois (450) là où la médiane résiste (350)", () => {
    const med = coupleTendencies(sixVar, { y: 2026, m: 9 });
    const moy = coupleTendencies(sixVar, { y: 2026, m: 9 }, { stat: "moyenne" });
    expect(med[0].tendency).toBe(350);
    expect(moy[0].tendency).toBe(450);
  });

  it("meanOf : moyenne simple, 0 si vide", () => {
    expect(meanOf([1, 2, 3])).toBe(2);
    expect(meanOf([400, 500, 1200])).toBe(700);
    expect(meanOf([])).toBe(0);
  });
});

describe("réglages — fenêtre d'apprentissage", () => {
  it("fenêtre réduite à 3 mois : seuls les 3 derniers mois complets comptent", () => {
    // Fenêtre = juin–août : [400, 500, 1200] → médiane 500, moyenne 700.
    const tend = coupleTendencies(sixVar, { y: 2026, m: 9 }, { window: 3 });
    expect(tend[0].windowMonths).toBe(3);
    expect(tend[0].tendency).toBe(500);
    const tendMoy = coupleTendencies(sixVar, { y: 2026, m: 9 }, { window: 3, stat: "moyenne" });
    expect(tendMoy[0].tendency).toBe(700);
  });
});

describe("réglages — seuil de présence", () => {
  it("seuil abaissé : une habitude peu fréquente devient provisionnable en moyenne", () => {
    // Taxis vus une fois sur 6 mois (fenêtre portée par les restaurants).
    const data = [...sixVar, x(2026, 8, 5, 300, "voyages-transports", "taxis")];
    const defaut = coupleTendencies(data, { y: 2026, m: 9 });
    const taxisDefaut = defaut.find((t) => t.sub === "taxis");
    expect(taxisDefaut.presence).toBe(1);
    expect(taxisDefaut.tendency).toBe(0); // médiane à zéros inclus : 0 de toute façon
    const ouvert = coupleTendencies(data, { y: 2026, m: 9 }, { presenceMin: 0.1, stat: "moyenne" });
    expect(ouvert.find((t) => t.sub === "taxis").tendency).toBe(50); // 300 / 6
  });

  it("seuil relevé à 80 % : une habitude présente 4 mois sur 6 n'est plus provisionnée", () => {
    // Restaurants avril–juillet (4 mois) ; taxis chaque mois avril–septembre (étend la fenêtre à 6 mois).
    const taxis = [3, 4, 5, 6, 7, 8].map((m) => x(2026, m, 5, 10, "voyages-transports", "taxis"));
    const resto4 = sixVar.slice(0, 4);
    const tend = coupleTendencies([...resto4, ...taxis], { y: 2026, m: 9 }, { presenceMin: 0.8 });
    const resto = tend.find((t) => t.sub === "restaurants");
    expect(resto.presence).toBe(4);
    expect(resto.windowMonths).toBe(6);
    expect(resto.tendency).toBe(0);
  });
});

describe("remainingProvision — réglages", () => {
  it("les réglages se propagent à la provision restante", () => {
    const defaut = remainingProvision({ extras: sixVar, expenses: [], y: 2026, m: 9 });
    expect(defaut.total).toBe(350);
    const w3 = remainingProvision({ extras: sixVar, expenses: [], y: 2026, m: 9, settings: { window: 3 } });
    expect(w3.total).toBe(500);
    const w3moy = remainingProvision({
      extras: sixVar, expenses: [], y: 2026, m: 9, settings: { window: 3, stat: "moyenne" },
    });
    expect(w3moy.total).toBe(700);
  });
});

/* ------------------------------------------------------------------ */
/* v0.24 — Transferts internes ⇄ exclus de la provision               */
/* ------------------------------------------------------------------ */

describe("remainingProvision — transferts internes", () => {
  const x = (y, m, day, amount, cat = "loisirs", sub = "taxis") => ({
    id: y + "-" + m + "-" + day, label: "x", amount, day, y, m, cat, sub,
  });

  it("un couple ⇄ n'apprend aucune tendance (versements d'épargne ≠ habitude)", () => {
    const extras = [
      x(2026, 3, 5, 3000, "epargne", "epargne-bancaire"),
      x(2026, 4, 5, 2200, "epargne", "epargne-bancaire"),
      x(2026, 5, 5, 800, "epargne", "epargne-bancaire"),
      x(2026, 6, 5, 200, "epargne", "epargne-bancaire"),
    ];
    const p = remainingProvision({ extras, expenses: [], y: 2026, m: 9 });
    expect(p.total).toBe(0);
    expect(p.lines).toHaveLength(0);
  });

  it("le déjà-dépensé du mois courant ignore aussi les transferts ⇄", () => {
    const extras = [
      x(2026, 4, 2, 100),
      x(2026, 5, 2, 100),
      x(2026, 6, 2, 100),
      x(2026, 9, 5, 3000, "epargne", "epargne-bancaire"), // versement ce mois-ci
    ];
    const p = remainingProvision({ extras, expenses: [], y: 2026, m: 9 });
    // Tendance taxis = 100 ; le versement de 3000 ne fait ni tendance ni dépense.
    expect(p.lines.find((l) => l.sub === "taxis")?.tendency).toBe(100);
    expect(p.lines.find((l) => l.sub === "epargne-bancaire")).toBeUndefined();
  });

  it("le marqueur ⇄ est honoré depuis la nomenclature passée (taxo)", () => {
    // Un couple NON transfert par défaut devient transfert via la nomenclature.
    const taxo = TAXONOMIE.map((c) =>
      c.id === "voyages-transports"
        ? { ...c, subs: c.subs.map((s) => (s.id === "taxis" ? { ...s, transfer: true } : s)) }
        : c
    );
    const extras = [
      x(2026, 4, 2, 100, "voyages-transports"),
      x(2026, 5, 2, 100, "voyages-transports"),
      x(2026, 6, 2, 100, "voyages-transports"),
    ];
    const p = remainingProvision({ extras, expenses: [], y: 2026, m: 9, taxo });
    expect(p.total).toBe(0);
  });
});
