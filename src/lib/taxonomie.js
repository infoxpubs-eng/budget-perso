/**
 * taxonomie.js — Nomenclature bancaire à 2 niveaux de « Budget prévisionnel ».
 *
 * Chaque catégorie possède une nature ("depense" ou "revenu") et des
 * sous-catégories. Les sous-catégories peuvent redéfinir la nature
 * (ex. « Remboursement impôts » est un revenu sous une catégorie de dépense).
 *
 * Chaque catégorie/sous-catégorie de dépense est rattachée à l'une des 6
 * enveloppes budgétaires historiques via la propriété `env`
 * (voir budget.js → ENVELOPPES).
 *
 * Module sans dépendance React : testable isolément (voir budget.test.js).
 */

export const TAXONOMIE = [
  {
    id: "logement", label: "Logement", nature: "depense", env: "domestiques",
    subs: [
      { id: "loyers-charges", label: "Loyers, Charges" },
      { id: "emprunt-immo", label: "Emprunt immobilier" },
      { id: "assurance-habitation", label: "Assurance habitation et RC" },
      { id: "energie", label: "Energie (électricité, gaz, fuel, chauffage…)" },
      { id: "travaux", label: "Travaux, réparation, entretien, aménagement…" },
      { id: "frais-exceptionnels", label: "Frais exceptionnels (déménagements, frais agences…)" },
    ],
  },
  {
    id: "vie-quotidienne", label: "Vie quotidienne", nature: "depense", env: "habituelles",
    subs: [
      { id: "alimentation", label: "Alimentation" },
      { id: "vetements", label: "Vêtements et accessoires" },
      { id: "livres", label: "Livres, CD/DVD, bijoux, jouets…" },
      { id: "electronique", label: "Électronique et informatique" },
      { id: "mobilier", label: "Mobilier, électroménager, décoration…" },
      { id: "equipements-sportifs", label: "Équipements sportifs et artistiques" },
      { id: "animaux", label: "Animaux domestiques" },
      { id: "remb-vie-quotidienne", label: "Remboursements frais de vie quotidienne" },
      { id: "autres", label: "Vie Quotidienne - Autres" },
    ],
  },
  {
    id: "loisirs", label: "Loisirs", nature: "depense", env: "loisirs",
    subs: [
      { id: "restaurants", label: "Restaurants, bars, discothèques…" },
      { id: "club", label: "Club / association (sport, hobby, art…)", env: "sports" },
      { id: "culture", label: "Divertissement - culture (ciné, théâtre, concerts…)" },
      { id: "autres", label: "Loisirs - Autres" },
    ],
  },
  {
    id: "voyages-transports", label: "Voyages et Transports", nature: "depense", env: "voyages",
    subs: [
      { id: "quotidiens", label: "Transports quotidiens (métro, bus…)" },
      { id: "longue-distance", label: "Transports longue distance (avions, trains…)" },
      { id: "taxis", label: "Taxis" },
      { id: "hebergement", label: "Hébergement (hôtels, camping…)" },
    ],
  },
  {
    id: "sante", label: "Santé", nature: "depense", env: "habituelles",
    subs: [
      { id: "complementaires", label: "Complémentaires santé" },
      { id: "pharmacie", label: "Pharmacie et laboratoire" },
      { id: "medecins", label: "Médecins et frais médicaux" },
    ],
  },
  {
    id: "abonnements", label: "Abonnements et téléphonie", nature: "depense", env: "domestiques",
    subs: [
      { id: "telephonie", label: "Téléphonie (fixe et mobile)" },
      { id: "multimedia", label: "Multimédia à domicile (TV, internet, téléphonie…)" },
      { id: "autres", label: "Abonnements et téléphonie - Autres" },
    ],
  },
  {
    id: "services-financiers", label: "Services financiers / professionnels", nature: "depense", env: "domestiques",
    subs: [
      { id: "frais-bancaires", label: "Frais bancaires et de gestion (dont agios)" },
      { id: "remboursement-frais", label: "Remboursement de frais", env: "habituelles" },
    ],
  },
  {
    id: "impots-taxes", label: "Impôts et Taxes", nature: "depense", env: "domestiques",
    subs: [
      { id: "impots-autres", label: "Impôts et Taxes - Autres" },
      { id: "remb-impots", label: "Remboursement impôts", nature: "revenu" },
    ],
  },
  {
    id: "auto-moto", label: "Auto et Moto", nature: "depense", env: "habituelles",
    subs: [
      { id: "carburant", label: "Carburant" },
      { id: "peages", label: "Péages" },
      { id: "entretien", label: "Entretien, réparations…" },
    ],
  },
  {
    id: "cadeaux-solidarite", label: "Cadeaux et solidarité", nature: "depense", env: "sports",
    subs: [
      { id: "dons", label: "Dons et Cadeaux" },
      { id: "solidarite", label: "Solidarité - Autres" },
    ],
  },
  {
    id: "emprunts-conso", label: "Emprunts (hors immobilier)", nature: "depense", env: "domestiques",
    subs: [
      { id: "credit-conso", label: "Crédit conso" },
    ],
  },
  {
    id: "epargne", label: "Dépenses d'épargne", nature: "depense", env: "domestiques",
    subs: [
      { id: "epargne-bancaire", label: "Épargne bancaire (Livret A, PEL…)" },
    ],
  },
  {
    id: "frais-pro", label: "Frais Professionnels", nature: "depense", env: "habituelles",
    subs: [
      { id: "remb-pro", label: "Remboursements frais professionnels" },
    ],
  },
  {
    id: "virements-emis", label: "Virements émis", nature: "depense", env: "sports", subs: [],
  },
  {
    id: "retraits", label: "Retraits", nature: "depense", env: "sports", subs: [],
  },
  {
    id: "mouvements-debiteurs", label: "Mouvements internes débiteurs", nature: "depense", env: "sports",
    subs: [
      { id: "virements-comptes", label: "Virements émis de comptes à comptes" },
      { id: "prelevements-cartes", label: "Prélèvements cartes débit différé et cartes crédit conso" },
    ],
  },
  {
    id: "virements-recus", label: "Virements reçus", nature: "revenu", subs: [],
  },
  {
    id: "mouvements-crediteurs", label: "Mouvements internes créditeurs", nature: "revenu",
    subs: [
      { id: "virements-recus-comptes", label: "Virements reçus de comptes à comptes" },
    ],
  },
  {
    id: "remboursements", label: "Remboursements", nature: "revenu",
    subs: [
      { id: "remboursements-autres", label: "Remboursements - Autres" },
    ],
  },
  {
    id: "revenus-travail", label: "Revenus du travail", nature: "revenu",
    subs: [
      { id: "salaire-fixe", label: "Salaire fixe" },
    ],
  },
  {
    id: "revenus-epargne", label: "Revenus d'épargne", nature: "revenu",
    subs: [
      { id: "placements", label: "Revenus placement immobiliers" },
      { id: "autres", label: "Revenus d'épargne - Autres" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Recherche                                                            */
/* ------------------------------------------------------------------ */

/** Catégorie par identifiant, ou undefined. */
export function taxCat(id) {
  return TAXONOMIE.find((c) => c.id === id);
}

/** Sous-catégorie d'une catégorie, ou undefined. */
export function taxSub(catId, subId) {
  return taxCat(catId)?.subs.find((s) => s.id === subId);
}

/** Nature effective d'une sous-catégorie (redéfinition possible). */
export function subNature(cat, sub) {
  if (!cat) return null;
  if (sub) return sub.nature ?? cat.nature;
  return cat.nature;
}

/** Libellé lisible d'un couple (catégorie, sous-catégorie). */
export function labelOf(catId, subId) {
  const c = taxCat(catId);
  const s = subId ? taxSub(catId, subId) : null;
  if (!c) return "?";
  return s ? c.label + " · " + s.label : c.label;
}

/* ------------------------------------------------------------------ */
/* Enveloppes budgétaires                                               */
/* ------------------------------------------------------------------ */

/**
 * Enveloppe budgétaire d'une dépense récurrente.
 * La sous-catégorie peut redéfinir l'enveloppe (ex. Club / association → sports),
 * sinon on prend celle de la catégorie, sinon le fourre-tout "sports & autres".
 * Les dépenses exceptionnelles relèvent toujours de l'enveloppe "exceptionnelles".
 */
export function envelopeOf(catId, subId) {
  const c = taxCat(catId);
  if (!c) return "sports";
  const s = subId ? c.subs.find((x) => x.id === subId) : null;
  return s?.env ?? c.env ?? "sports";
}

/* ------------------------------------------------------------------ */
/* Listes filtrées pour les formulaires                                 */
/* ------------------------------------------------------------------ */

/** Catégories éligibles pour une dépense (nature dépense, sous-catégories filtrées). */
export function depenseCats() {
  return TAXONOMIE.map((c) => ({
    ...c,
    subs: c.subs.filter((s) => subNature(c, s) === "depense"),
  })).filter((c) => c.nature === "depense");
}

/** Options « Catégorie — Sous-catégorie » éligibles pour un revenu. */
export function revenuOptions() {
  const out = [];
  for (const c of TAXONOMIE) {
    for (const s of c.subs) {
      if (subNature(c, s) === "revenu") {
        out.push({ value: c.id + "|" + s.id, label: c.label + " — " + s.label });
      }
    }
    if (c.subs.length === 0 && c.nature === "revenu") {
      out.push({ value: c.id + "|", label: c.label });
    }
  }
  return out;
}
