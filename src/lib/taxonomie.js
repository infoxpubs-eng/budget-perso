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
      { id: "loyers-charges", label: "Loyers, Charges" , recurring: true, incompressible: true },
      { id: "emprunt-immo", label: "Emprunt immobilier" , recurring: true, incompressible: true },
      { id: "assurance-habitation", label: "Assurance habitation et RC" , recurring: true, incompressible: true },
      { id: "energie", label: "Energie (électricité, gaz, fuel, chauffage…)" , recurring: true, incompressible: true },
      { id: "travaux", label: "Travaux, réparation, entretien, aménagement…" },
      { id: "frais-exceptionnels", label: "Frais exceptionnels (déménagements, frais agences…)" },
    ],
  },
  {
    id: "vie-quotidienne", label: "Vie quotidienne", nature: "depense", env: "habituelles",
    subs: [
      { id: "alimentation", label: "Alimentation" , recurring: true, incompressible: true },
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
      { id: "quotidiens", label: "Transports quotidiens (métro, bus…)" , recurring: true, incompressible: true },
      { id: "longue-distance", label: "Transports longue distance (avions, trains…)" },
      { id: "taxis", label: "Taxis" },
      { id: "hebergement", label: "Hébergement (hôtels, camping…)" },
    ],
  },
  {
    id: "sante", label: "Santé", nature: "depense", env: "habituelles",
    subs: [
      { id: "complementaires", label: "Complémentaires santé" , recurring: true, incompressible: true },
      { id: "pharmacie", label: "Pharmacie et laboratoire" },
      { id: "medecins", label: "Médecins et frais médicaux" },
    ],
  },
  {
    id: "abonnements", label: "Abonnements et téléphonie", nature: "depense", env: "domestiques",
    subs: [
      { id: "telephonie", label: "Téléphonie (fixe et mobile)" , recurring: true },
      { id: "multimedia", label: "Multimédia à domicile (TV, internet, téléphonie…)" , recurring: true },
      { id: "autres", label: "Abonnements et téléphonie - Autres" },
    ],
  },
  {
    id: "services-financiers", label: "Services financiers / professionnels", nature: "depense", env: "domestiques",
    subs: [
      { id: "frais-bancaires", label: "Frais bancaires et de gestion (dont agios)" , recurring: true, incompressible: true },
      { id: "remboursement-frais", label: "Remboursement de frais", env: "habituelles" },
    ],
  },
  {
    id: "impots-taxes", label: "Impôts et Taxes", nature: "depense", env: "domestiques",
    subs: [
      { id: "impots-autres", label: "Impôts et Taxes - Autres" , recurring: true, incompressible: true },
      { id: "remb-impots", label: "Remboursement impôts", nature: "revenu" },
    ],
  },
  {
    id: "auto-moto", label: "Auto et Moto", nature: "depense", env: "habituelles",
    subs: [
      { id: "carburant", label: "Carburant" , recurring: true },
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
      { id: "credit-conso", label: "Crédit conso" , recurring: true, incompressible: true },
    ],
  },
  {
    id: "epargne", label: "Dépenses d'épargne", nature: "depense", env: "domestiques",
    subs: [
      { id: "epargne-bancaire", label: "Épargne bancaire (Livret A, PEL…)" , recurring: true },
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
      { id: "salaire-fixe", label: "Salaire fixe" , recurring: true },
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
export function taxCat(id, taxo = TAXONOMIE) {
  return taxo.find((c) => c.id === id);
}

/** Sous-catégorie d'une catégorie, ou undefined. */
export function taxSub(catId, subId, taxo = TAXONOMIE) {
  return taxCat(catId, taxo)?.subs.find((s) => s.id === subId);
}

/**
 * Le couple (catégorie, sous-catégorie) est-il marqué « récurrente 🔁 »
 * dans la nomenclature ? Sans couple connu, la réponse est non : ce sont
 * les paramètres de la nomenclature qui décident, comme pour
 * l'incompressible.
 */
export function subRecurring(catId, subId, taxo = TAXONOMIE) {
  if (!catId || !subId) return false;
  return !!taxSub(catId, subId, taxo)?.recurring;
}

/** Nature effective d'une sous-catégorie (redéfinition possible). */
export function subNature(cat, sub) {
  if (!cat) return null;
  if (sub) return sub.nature ?? cat.nature;
  return cat.nature;
}

/** Libellé lisible d'un couple (catégorie, sous-catégorie). */
export function labelOf(catId, subId, taxo = TAXONOMIE) {
  const c = taxCat(catId, taxo);
  const s = subId ? taxSub(catId, subId, taxo) : null;
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
export function envelopeOf(catId, subId, taxo = TAXONOMIE) {
  const c = taxCat(catId, taxo);
  if (!c) return "sports";
  const s = subId ? c.subs.find((x) => x.id === subId) : null;
  return s?.env ?? c.env ?? "sports";
}

/* ------------------------------------------------------------------ */
/* Listes filtrées pour les formulaires                                 */
/* ------------------------------------------------------------------ */

/** Catégories éligibles pour une dépense (nature dépense, sous-catégories filtrées). */
export function depenseCats(taxo = TAXONOMIE) {
  return taxo
    .filter((c) => c.nature === "depense" && c.active !== false)
    .map((c) => ({
      ...c,
      subs: c.subs.filter((s) => s.active !== false && subNature(c, s) === "depense"),
    }));
}

/** Options « Catégorie — Sous-catégorie » éligibles pour un revenu. */
export function revenuOptions(taxo = TAXONOMIE) {
  const out = [];
  for (const c of taxo) {
    if (c.active === false) continue;
    for (const s of c.subs) {
      if (s.active !== false && subNature(c, s) === "revenu") {
        out.push({ value: c.id + "|" + s.id, label: c.label + " — " + s.label });
      }
    }
    if (c.subs.length === 0 && c.nature === "revenu") {
      out.push({ value: c.id + "|", label: c.label });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Correspondance par libellé (import CSV bancaire)                     */
/* ------------------------------------------------------------------ */

/**
 * Normalise un libellé pour comparaison tolérante : minuscules, accents
 * retirés, points de suspension et parenthèses ignorés, espaces compactés.
 */
export function normalizeLabel(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[…]|\.\.\./g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Catégorie dont le libellé correspond (tolérant aux accents / «…»). */
export function catByLabel(label, taxo = TAXONOMIE) {
  const n = normalizeLabel(label);
  if (!n) return undefined;
  return taxo.find((c) => c.active !== false && normalizeLabel(c.label) === n);
}

/** Sous-catégorie d'une catégorie dont le libellé correspond. */
export function subByLabel(catId, subLabel, taxo = TAXONOMIE) {
  const c = taxCat(catId, taxo);
  const n = normalizeLabel(subLabel);
  if (!c || !n) return undefined;
  return c.subs.find((s) => s.active !== false && normalizeLabel(s.label) === n);
}

/**
 * Sous-catégorie d'une catégorie dont le libellé **apparaît dans** un libellé
 * d'opération bancaire (recherche par inclusion, tolérante aux accents et à
 * la casse). Les libellés trop courts (< 4 caractères normalisés) sont
 * ignorés pour éviter les faux positifs. Sert de repli à l'import CSV quand
 * la colonne Sous-Catégorie est inconnue.
 */
export function subByOperation(catId, opLabel, taxo = TAXONOMIE) {
  const c = taxCat(catId, taxo);
  const n = normalizeLabel(opLabel);
  if (!c || !n) return undefined;
  return c.subs.find((s) => {
    const sn = normalizeLabel(s.label);
    return s.active !== false && sn.length >= 4 && n.includes(sn);
  });
}

/* ------------------------------------------------------------------ */
/* Console d'administration de la nomenclature                          */
/* ------------------------------------------------------------------ */

/**
 * Version des marqueurs par défaut (🔁/🔒) de la nomenclature. Quand un état
 * sauvegardé porte une version différente (ou absente), `migrateState`
 * applique les défauts par fusion (voir applyDefaultFlags) puis enregistre
 * la version — les choix explicitement faits ensuite dans la console
 * d'administration ne sont plus écrasés.
 */
export const TAXO_FLAGS_VERSION = 1;

/**
 * Fusionne les marqueurs 🔁/🔒 des sous-catégories de référence sur une
 * nomenclature existante — fonction pure. La fusion ne retire jamais de
 * marqueur : un indicateur déjà à `true` (choix de l'utilisateur) est
 * conservé ; les sous-catégories personnalisées (hors nomenclature de
 * référence) ne sont pas touchées.
 */
export function applyDefaultFlags(taxo) {
  return taxo.map((c) => {
    const ref = TAXONOMIE.find((x) => x.id === c.id);
    if (!ref) return c;
    return {
      ...c,
      subs: c.subs.map((s) => {
        const refSub = ref.subs.find((x) => x.id === s.id);
        if (!refSub) return s;
        return {
          ...s,
          recurring: !!s.recurring || !!refSub.recurring,
          incompressible: !!s.incompressible || !!refSub.incompressible,
        };
      }),
    };
  });
}

/** Copie profonde et indépendante de la nomenclature par défaut. */
export function defaultTaxonomie() {
  return JSON.parse(JSON.stringify(TAXONOMIE));
}

/** Identifiant technique à partir d'un libellé (accents retirés, minuscules). */
export function slugify(label) {
  return (
    normalizeLabel(label)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cat"
  );
}

/** Identifiant de catégorie unique (suffixe -2, -3… en cas de collision). */
function uniqueCatId(taxo, base) {
  let id = base;
  let k = 2;
  while (taxo.some((c) => c.id === id)) id = base + "-" + k++;
  return id;
}

/** Identifiant de sous-catégorie unique dans sa catégorie. */
function uniqueSubId(cat, base) {
  let id = base;
  let k = 2;
  while (cat.subs.some((s) => s.id === id)) id = base + "-" + k++;
  return id;
}

/**
 * Ajoute une catégorie (sans sous-catégorie) et renvoie la nouvelle
 * nomenclature — fonction pure, l'originale n'est pas modifiée.
 * @throws {Error} libellé vide ou déjà existant (comparaison tolérante)
 */
export function addCategory(taxo, { label, nature = "depense", env = "sports" }) {
  const l = String(label ?? "").trim();
  if (!l) throw new Error("Libellé de catégorie requis");
  const norm = normalizeLabel(l);
  if (taxo.some((c) => normalizeLabel(c.label) === norm)) {
    throw new Error("Catégorie déjà existante : " + l);
  }
  const cat = { id: uniqueCatId(taxo, slugify(l)), label: l, nature, subs: [] };
  if (nature === "depense") cat.env = env;
  return [...taxo, cat];
}

/**
 * Ajoute un couple (catégorie existante, nouvelle sous-catégorie) avec ses
 * indicateurs « récurrente » / « incompressible » — fonction pure.
 * `nature` redéfinit éventuellement la nature de la sous-catégorie
 * (ex. remboursement sous une catégorie de dépense).
 * @throws {Error} catégorie inconnue, libellé vide ou déjà présent
 */
export function addSubcategory(taxo, catId, { label, recurring = false, incompressible = false, nature } = {}) {
  const cat = taxo.find((c) => c.id === catId);
  if (!cat) throw new Error("Catégorie inconnue : " + catId);
  const l = String(label ?? "").trim();
  if (!l) throw new Error("Libellé de sous-catégorie requis");
  const norm = normalizeLabel(l);
  if (cat.subs.some((s) => normalizeLabel(s.label) === norm)) {
    throw new Error("Sous-catégorie déjà existante : " + l);
  }
  const sub = {
    id: uniqueSubId(cat, slugify(l)),
    label: l,
    recurring: !!recurring,
    incompressible: !!incompressible,
  };
  if (nature) sub.nature = nature;
  return taxo.map((c) => (c.id === catId ? { ...c, subs: [...c.subs, sub] } : c));
}

/**
 * Remplace les indicateurs « récurrente » / « incompressible » d'une
 * sous-catégorie — fonction pure. Les deux valeurs sont requises
 * (passer l'ancienne valeur pour ne changer qu'un indicateur).
 * @throws {Error} catégorie ou sous-catégorie inconnue
 */
export function setSubFlags(taxo, catId, subId, { recurring, incompressible }) {
  const cat = taxo.find((c) => c.id === catId);
  if (!cat) throw new Error("Catégorie inconnue : " + catId);
  if (!cat.subs.some((s) => s.id === subId)) throw new Error("Sous-catégorie inconnue : " + subId);
  return taxo.map((c) =>
    c.id !== catId
      ? c
      : {
          ...c,
          subs: c.subs.map((s) =>
            s.id !== subId ? s : { ...s, recurring: !!recurring, incompressible: !!incompressible }
          ),
        }
  );
}


/**
 * Renomme une catégorie — fonction pure. Les écritures existantes pointent
 * l'identifiant (inchangé), elles suivent donc le nouveau libellé.
 * @throws {Error} catégorie inconnue, libellé vide ou déjà utilisé
 */
export function renameCategory(taxo, catId, label) {
  const cat = taxo.find((c) => c.id === catId);
  if (!cat) throw new Error("Catégorie inconnue : " + catId);
  const l = String(label ?? "").trim();
  if (!l) throw new Error("Libellé de catégorie requis");
  const norm = normalizeLabel(l);
  if (taxo.some((c) => c.id !== catId && normalizeLabel(c.label) === norm)) {
    throw new Error("Catégorie déjà existante : " + l);
  }
  return taxo.map((c) => (c.id === catId ? { ...c, label: l } : c));
}

/**
 * Renomme une sous-catégorie — fonction pure.
 * @throws {Error} inconnue, libellé vide ou déjà utilisé dans la catégorie
 */
export function renameSubcategory(taxo, catId, subId, label) {
  const cat = taxo.find((c) => c.id === catId);
  const sub = cat?.subs.find((s) => s.id === subId);
  if (!cat || !sub) throw new Error("Sous-catégorie inconnue : " + subId);
  const l = String(label ?? "").trim();
  if (!l) throw new Error("Libellé de sous-catégorie requis");
  const norm = normalizeLabel(l);
  if (cat.subs.some((s) => s.id !== subId && normalizeLabel(s.label) === norm)) {
    throw new Error("Sous-catégorie déjà existante : " + l);
  }
  return taxo.map((c) =>
    c.id !== catId
      ? c
      : { ...c, subs: c.subs.map((s) => (s.id !== subId ? s : { ...s, label: l })) }
  );
}

/**
 * Active/désactive une catégorie — fonction pure. Une catégorie désactivée
 * (`active: false`) disparaît des formulaires et de la reconnaissance CSV,
 * sans supprimer les écritures qui l'utilisent (elles restent affichées
 * et comptées dans les totaux).
 */
export function setCategoryActive(taxo, catId, active) {
  if (!taxo.some((c) => c.id === catId)) throw new Error("Catégorie inconnue : " + catId);
  return taxo.map((c) => (c.id === catId ? { ...c, active: !!active } : c));
}

/** Active/désactive une sous-catégorie (même sémantique que la catégorie). */
export function setSubActive(taxo, catId, subId, active) {
  const cat = taxo.find((c) => c.id === catId);
  if (!cat || !cat.subs.some((s) => s.id === subId)) throw new Error("Sous-catégorie inconnue : " + subId);
  return taxo.map((c) =>
    c.id !== catId
      ? c
      : { ...c, subs: c.subs.map((s) => (s.id !== subId ? s : { ...s, active: !!active })) }
  );
}

/** Indique si une sous-catégorie est marquée incompressible. */
export function subIncompressible(catId, subId, taxo = TAXONOMIE) {
  return !!taxSub(catId, subId, taxo)?.incompressible;
}
