import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { v4 as uuid } from "uuid";
import {
  ENVELOPPES,
  MONTHS,
  daysInMonth,
  fmt,
  monthLabel,
  salaryPayDay,
  simulate,
  monthSim,
  loadedMonths,
  savingsFlowHistory,
  hasRealData,
  realMonthSim,
  simStart,
  migrateState,
  monthlyExpenses,
  isRecurringExpense,
  isRecurringIncome,
  recurringSchedule,
  recurringMonthTotals,
} from "./lib/budget.js";
import {
  TAXONOMIE,
  depenseCats,
  revenuOptions,
  taxCat,
  taxSub,
  labelOf,
  envelopeOf,
  extraOneShot,
  subNature,
  addCategory,
  addSubcategory,
  setSubFlags,
  renameCategory,
  renameSubcategory,
  setCategoryActive,
  setSubActive,
} from "./lib/taxonomie.js";
import { parseCsv, rowsToEntries, applyTaxoAdditions, mergeHistory, mergeAddedLines, A_CLASSER } from "./lib/import-csv.js";
import { remainingProvision, DEFAULT_ESTIMATION } from "./lib/estimation.js";

/* ============================== Données initiales ============================== */

const DEFAULT_STATE = migrateState({
  soldeDepart: 1500,
  expenses: [
    { id: uuid(), label: "Loyer", amount: 850, day: 3, cat: "logement", sub: "loyers-charges", freq: "mensuelle", incompressible: true },
    { id: uuid(), label: "Électricité / gaz", amount: 95, day: 8, cat: "logement", sub: "energie", freq: "mensuelle", incompressible: true },
    { id: uuid(), label: "Courses (début de mois)", amount: 220, day: 5, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle", incompressible: true },
    { id: uuid(), label: "Courses (mi-mois)", amount: 220, day: 20, cat: "vie-quotidienne", sub: "alimentation", freq: "mensuelle" },
    { id: uuid(), label: "Internet + mobile", amount: 45, day: 12, cat: "abonnements", sub: "multimedia", freq: "mensuelle", incompressible: true },
    { id: uuid(), label: "Salle de sport", amount: 30, day: 1, cat: "loisirs", sub: "club", freq: "mensuelle", incompressible: true },
    { id: uuid(), label: "Streaming & abonnements", amount: 25, day: 15, cat: "loisirs", sub: "culture", freq: "mensuelle" },
    { id: uuid(), label: "Sorties / restaurants", amount: 80, day: 25, cat: "loisirs", sub: "restaurants", freq: "mensuelle" },
    { id: uuid(), label: "Vacances d'été", amount: 1200, day: 2, cat: "voyages-transports", sub: "hebergement", freq: "annuelle", month: 7 },
  ],
  incomes: [
    { id: uuid(), label: "Salaire", amount: 2500, mode: "salaire", treizieme: true, bonus: 1000 },
    { id: uuid(), label: "Aide / allocations", amount: 180, day: 5, mode: "fixe" },
  ],
  extras: [], // rien de non planifié par défaut : seules les situations
  // explicitement flaguées comme telles entrent dans la simulation
  budgets: { domestiques: 1000, habituelles: 500, sports: 50, loisirs: 120, voyages: 100, exceptionnelles: 300 },
});

/* ============================== Composants UI ============================== */

function Card({ children, className }) {
  return (
    <div className={"rounded-xl border border-slate-200 bg-white p-4 shadow-sm " + (className ?? "")}>
      {children}
    </div>
  );
}

function Kpi({ label, value, hint, tone }) {
  const toneCls =
    tone === "good" ? "text-emerald-600" :
    tone === "bad" ? "text-rose-600" :
    tone === "accent" ? "text-indigo-600" : "text-slate-900";
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"mt-1 font-bold tabular-nums " + toneCls} style={{ fontSize: "clamp(1.05rem, 1.9vw, 1.5rem)", whiteSpace: "nowrap" }}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-slate-500">{hint}</div>}
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function fmtInput(n) {
  return String(n).replace(".", ",");
}

function NumInput({ value, onChange }) {
  const [raw, setRaw] = useState(null);
  const shown = raw !== null ? raw : value === 0 ? "" : fmtInput(value);
  return (
    <input
      className={inputCls}
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder="0"
      onChange={(e) => {
        const v = e.target.value;
        if (/^[0-9]*[.,]?[0-9]{0,2}$/.test(v)) setRaw(v);
      }}
      onBlur={() => {
        if (raw !== null) {
          const n = parseFloat(raw.replace(",", "."));
          onChange(isNaN(n) ? 0 : n);
          setRaw(null);
        }
      }}
    />
  );
}

function Badge({ children, color }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color + "18", color }}
    >
      {children}
    </span>
  );
}

const IncBadge = () => (
  <Badge color="#475569">🔒 Incompressible</Badge>
);

const RecBadge = () => (
  <Badge color="#0ea5e9">🔁 Récurrent</Badge>
);

function CheckRow({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/* ============================== Tooltips ============================== */

function BalanceTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="text-xs font-semibold text-slate-500">{p.day === 0 ? "Début " + p.date.split(" ")[1] : p.date}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{fmt(p.solde)}</div>
      {p.events.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {p.events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-4 text-xs">
              <span className="text-slate-600">
                {e.label}
                {e.inc ? " 🔒" : ""}
                {e.transfer ? " ⇄" : e.rec ? " 🔁" : " ✨"}
              </span>
              <span className={e.type === "in" ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                {e.type === "in" ? "+" : "−"}{fmt(Math.abs(e.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-slate-600">{label}</div>
      <div className="mt-1 font-bold text-slate-900">Fin de mois : {fmt(payload[0].value)}</div>
      {payload.length > 1 && (
        <div className="mt-0.5 text-amber-600">Point bas : {fmt(payload[1].value)}</div>
      )}
    </div>
  );
}

/* ============================== App ============================== */

export default function App() {
  const now = new Date();
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("apercu");
  // Mois affiché : clé "y-m" (les mois chargés hors fenêtre y figurent aussi)
  const [selKey, setSelKey] = useState(null);
  // Filtre du sélecteur : ne montrer que les mois chargés (🧾)
  const [onlyLoaded, setOnlyLoaded] = useState(false);
  const fileRef = useRef(null);
  const csvRef = useRef(null);
  // Rapport d'import CSV en attente de confirmation (dialogue dédié)
  const [csvImport, setCsvImport] = useState(null);

  // ----- Persistance : chargement au démarrage -----
  useEffect(() => {
    try {
      const raw = localStorage.getItem("budget-perso-v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setState(migrateState(parsed));
      }
    } catch (e) {}
    setLoaded(true);
  }, []);

  // ----- Persistance : sauvegarde à chaque modification -----
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("budget-perso-v2", JSON.stringify(state));
    } catch (e) {}
  }, [state, loaded]);

  const start = useMemo(() => ({ y: now.getFullYear(), m: now.getMonth() }), []);

  // Nomenclature personnalisée (console d'administration), persistée avec l'état.
  const taxo = useMemo(() => state.taxonomie ?? TAXONOMIE, [state.taxonomie]);

  // ----- Ancrage de la simulation sur les mois chargés -----
  // Le solde de départ s'applique à la date chargée la plus lointaine
  // (simStart) ; l'historique enchaîne les mois jusqu'au mois courant,
  // dont le solde d'ouverture devient le solde résultant.
  const loadedList = useMemo(() => loadedMonths(state), [state]);
  // Trajectoire de l'épargne sur les mois chargés : flux net par mois et cumul.
  const savingsHist = useMemo(() => savingsFlowHistory(state), [state]);
  const anchor = useMemo(() => simStart(state, start.y, start.m), [state, start]);

  const hist = useMemo(() => {
    const months = [];
    let carry = state.soldeDepart;
    let y = anchor.y;
    let m = anchor.m;
    while (y < start.y || (y === start.y && m < start.m)) {
      // Mois chargé (🧾) : flux RÉELS du relevé — le solde de départ est la
      // balance à la date chargée la plus lointaine, à laquelle s'ajoutent
      // les lignes importées ; les récurrentes planifiées ne sont pas
      // re-simulées sur un mois où elles ont (ou n'ont pas) eu lieu.
      const month = hasRealData(state, y, m)
        ? realMonthSim(state, y, m, carry)
        : monthSim(state, y, m, carry);
      months.push(month);
      carry = month.end;
      const d = new Date(y, m + 1, 1);
      y = d.getFullYear();
      m = d.getMonth();
    }
    return { months, opening: carry };
  }, [state, anchor, start]);

  const sims = useMemo(() => {
    // Mois courant chargé : réel jusqu'à aujourd'hui, écritures planifiées
    // sans occurrence en prévision pour la fin du mois ; les mois suivants
    // restent simulés par les écritures planifiées, enchaînés dessus.
    if (hasRealData(state, start.y, start.m)) {
      const out = [];
      let carry = hist.opening;
      let y = start.y;
      let m = start.m;
      for (let i = 0; i < 12; i++) {
        const month = i === 0
          ? realMonthSim(state, y, m, carry, { today: now.getDate() })
          : monthSim(state, y, m, carry);
        out.push(month);
        carry = month.end;
        const d = new Date(y, m + 1, 1);
        y = d.getFullYear();
        m = d.getMonth();
      }
      return out;
    }
    return simulate(state, start.y, start.m, hist.opening);
  }, [state, start, hist.opening]);

  // ----- Sélecteur de mois : historique + 12 mois simulés + relevé au-delà -----
  const monthsAll = useMemo(() => {
    const dataKeys = new Set(loadedList.map((d) => d.y + "-" + d.m));
    const mark = (s, flags) => ({ ...s, ...flags, hasData: dataKeys.has(s.y + "-" + s.m) });
    // Mois chargés postérieurs à la fenêtre : enchaînés depuis sa fin.
    const lastSim = sims[sims.length - 1];
    const tail = [];
    let carry = lastSim.end;
    for (const d of loadedList) {
      if (d.y > lastSim.y || (d.y === lastSim.y && d.m > lastSim.m)) {
        const month = realMonthSim(state, d.y, d.m, carry);
        tail.push(month);
        carry = month.end;
      }
    }
    return [
      ...hist.months.map((s) => mark(s, { historique: true })),
      ...sims.map((s) => mark(s, {})),
      ...tail.map((s) => mark(s, { horsFenetre: true })),
    ];
  }, [state, loadedList, hist, sims]);

  const options = useMemo(() => {
    const filtered = onlyLoaded ? monthsAll.filter((s) => s.hasData) : monthsAll;
    return filtered.length > 0 ? filtered : monthsAll; // repli si aucun mois chargé
  }, [monthsAll, onlyLoaded]);

  // Par défaut : mois courant (le plus utile au quotidien), sinon premier mois.
  const sim =
    options.find((s) => s.y + "-" + s.m === selKey) ??
    options.find((s) => s.y === start.y && s.m === start.m) ??
    options[0] ??
    sims[0];
  const optIdx = options.indexOf(sim);
  // Index du mois affiché dans les 12 mois simulés (les formulaires ne
  // proposent que la fenêtre) ; 0 si le mois affiché est hors fenêtre.
  const simIdx = Math.max(0, sims.findIndex((s) => s.y === sim.y && s.m === sim.m));

  // Solde « actuel » : solde du mois affiché à la date d'aujourd'hui
  // (jour clampé au nombre de jours du mois ; projection pour un mois
  // autre que le mois en cours).
  const todayDay = Math.min(now.getDate(), sim.daily.length - 1);
  // Mois chargé : solde « actuel » = ouverture + cumul des flux RÉELS jusqu'à
  // aujourd'hui (la prévision des jours restants ne pollue pas la mesure).
  const soldeActuel =
    sim.realSoFar !== undefined && sim.y === now.getFullYear() && sim.m === now.getMonth()
      ? sim.start + sim.realSoFar
      : sim.daily[todayDay].solde;
  const isCurrentMonth = sim.y === now.getFullYear() && sim.m === now.getMonth();

  const setSolde = (n) => setState((s) => ({ ...s, soldeDepart: n }));

  const addExpense = (e) => setState((s) => ({ ...s, expenses: [...s.expenses, e] }));
  const delExpense = (id) => setState((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== id) }));
  const addExtra = (x) => setState((s) => ({ ...s, extras: [...s.extras, x] }));
  const delExtra = (id) => setState((s) => ({ ...s, extras: s.extras.filter((x) => x.id !== id) }));
  const patchExtra = (id, patch) =>
    setState((s) => ({ ...s, extras: s.extras.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addIncome = (i) => setState((s) => ({ ...s, incomes: [...s.incomes, i] }));
  const delIncome = (id) => setState((s) => ({ ...s, incomes: s.incomes.filter((x) => x.id !== id) }));
  const setBudget = (cat, n) => setState((s) => ({ ...s, budgets: { ...s.budgets, [cat]: n } }));

  // ----- Export / import / réinitialisation -----
  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budget-perso-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export impossible : " + e.message);
    }
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.incomes)) {
          throw new Error("structure inattendue");
        }
        setState(migrateState(parsed));
        setSelKey(null);
      } catch (e) {
        alert("Fichier invalide ou illisible.");
      }
    };
    reader.readAsText(file);
  };

  // ----- Import d'un relevé bancaire CSV, piloté par la nomenclature -----
  // Les couples catégorie / sous-catégorie du relevé sont rapprochés de la
  // nomenclature : leurs paramètres (récurrente 🔁, incompressible 🔒)
  // déterminent comment chaque ligne est intégrée. Le rapport s'affiche dans
  // un dialogue : les couples absents de la nomenclature y sont rangés dans
  // une catégorie (défaut « À classer ») et renommés avant confirmation.
  const importCsvFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = parseCsv(String(reader.result), state.taxonomie);
      } catch (e) {
        alert("Fichier CSV non reconnu : " + e.message);
        return;
      }
      if (parsed.rows.length === 0) {
        alert("Aucune ligne exploitable trouvée dans ce fichier." + (parsed.ignored ? " " + parsed.ignored + " ligne(s) illisible(s)." : ""));
        return;
      }
      const r = rowsToEntries(parsed.rows, state, state.taxonomie);
      setCsvImport({ parsed, r, choices: r.taxoAdditions.map(() => ({})) });
    };
    reader.readAsText(file);
  };

  // Met à jour le choix d'un couple à ranger : catégorie cible / libellé.
  const setCsvChoice = (i, patch) => {
    setCsvImport((s) => {
      if (!s) return s;
      const choices = [...s.choices];
      choices[i] = { ...choices[i], ...patch };
      return { ...s, choices };
    });
  };

  // Applique l'import confirmé : les couples absents sont intégrés selon les
  // choix (défaut « À classer »), et les écritures importées qui référencent
  // ces couples sont raccordées à leur nouvelle place.
  const confirmCsvImport = () => {
    const imp = csvImport;
    if (!imp) return;
    const { r, choices } = imp;
    setState((s) => {
      let taxo = s.taxonomie;
      let mapping = [];
      if (r.taxoAdditions.length) {
        ({ taxo, mapping } = applyTaxoAdditions(s.taxonomie, r.taxoAdditions, choices));
      }
      const remap = (x) => {
        if (x.cat !== A_CLASSER) return x;
        const m = mapping.find((mm) => mm.from === A_CLASSER + "|" + x.sub);
        return m ? { ...x, cat: m.cat, sub: m.sub, label: m.label } : x;
      };
      // Historique réel : les occurrences couvertes par une écriture déjà
      // planifiée (dates et montants observés du relevé) lui sont rattachées.
      // Rattachement au montant nouveau (syncAmount) : le montant prévisionnel
      // d'une écriture 🔁 suit la dernière occurrence observée.
      const withHistory = (entry, kind) => {
        const c = r.coveredHistory.find((cv) => cv.id === entry.id && cv.kind === kind);
        if (!c) return entry;
        const history = mergeHistory(entry.history, c.obs);
        const amount =
          c.syncAmount && history.length > 0
            ? history[history.length - 1].amount
            : entry.amount;
        return { ...entry, history, amount };
      };
      // Lignes ajoutées (dépenses et revenus uniques) dédoublonnées par
      // multiset : réimporter un même relevé n'ajoute rien.
      const extrasIn = mergeAddedLines(s.extras, r.extras.map(remap));
      const uniquesIn = mergeAddedLines(s.incomes, r.incomes.map(remap));
      return {
        ...s,
        taxonomie: taxo,
        expenses: [...s.expenses.map((e) => withHistory(e, "depense")), ...r.newExpenses.map(remap)],
        incomes: [
          ...s.incomes.map((i) => withHistory(i, "revenu")),
          ...r.newIncomes.map(remap),
          ...uniquesIn,
        ],
        extras: [...s.extras, ...extrasIn],
      };
    });
    setCsvImport(null);
  };

  const resetData = () => {
    if (window.confirm("Effacer toutes vos données et revenir à l'exemple de démonstration ?")) {
      try { localStorage.removeItem("budget-perso-v2"); } catch (e) {}
      setState(DEFAULT_STATE);
      setSelKey(null);
    }
  };

  // Dépenses planifiées du mois par enveloppe + répartition incompressible
  const agg = useMemo(() => monthlyExpenses(state, sim.y, sim.m), [state, sim.y, sim.m]);
  const byEnv = agg.byEnv;

  // Détail par catégorie bancaire pour chaque enveloppe ("env|cat|sub" → montant)
  const detailOf = (envId) =>
    Object.entries(agg.detail)
      .filter(([k]) => k.split("|")[0] === envId)
      .map(([k, amount]) => {
        const [, cat, sub] = k.split("|");
        return { cat, sub, amount };
      })
      .sort((a, b) => b.amount - a.amount);

  const dailyFlow = sim.daily
    .filter((d) => d.day > 0)
    .map((d) => ({
      day: d.day,
      flux: d.events.reduce((a, e) => a + e.amount, 0),
    }));

  const yearData = sims.map((s) => ({ label: s.label, solde: s.end, bas: s.min }));
  const echeancier = useMemo(() => recurringSchedule(state, sim.y, sim.m), [state, sim]);
  const recTotals = useMemo(() => recurringMonthTotals(state, sim.y, sim.m), [state, sim]);
  // Provision « habitudes non planifiées » du mois affiché : tendances des
  // couples sans écriture planifiée, moins ce qui est déjà dépensé.
  // Réglages du modèle (fenêtre, seuil de présence, statistique) : persistés
  // avec l'état, éditables dans la console 🛠️ Admin.
  const est = state.estimation ?? DEFAULT_ESTIMATION;
  const prov = useMemo(
    () => remainingProvision({ extras: state.extras, expenses: state.expenses, y: sim.y, m: sim.m, settings: est, taxo: state.taxonomie }),
    [state.extras, state.expenses, state.estimation, sim.y, sim.m]
  );
  const recYear = useMemo(
    () => sims.map((s) => ({ label: s.label, min: s.min, minDay: s.minDay, end: s.end, ...recurringMonthTotals(state, s.y, s.m) })),
    [state, sims]
  );

  const tabs = [
    { id: "apercu", label: "Aperçu" },
    { id: "depenses", label: "Dépenses" },
    { id: "revenus", label: "Revenus" },
    { id: "budget", label: "Budget par catégorie" },
    { id: "echeancier", label: "📅 Échéancier" },
    { id: "admin", label: "🛠️ Admin" },
  ];

  const btnCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* En-tête */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">💰 Budget prévisionnel</h1>
            <p className="text-sm text-slate-500">
              💾 Sauvegarde automatique dans ce navigateur · Mois 1 : {monthLabel(start.y, start.m)}
              {hist.months.length > 0 && (
                <> · Solde de départ appliqué à {monthLabel(anchor.y, anchor.m)} (date chargée la plus lointaine)</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Field label="Solde de départ (€)">
                <div title={hist.months.length > 0 ? "Solde à la date chargée la plus lointaine (" + monthLabel(anchor.y, anchor.m) + "), avant enchaînement de l'historique" : "Solde en début de mois 1"}>
                  <NumInput value={state.soldeDepart} onChange={setSolde} />
                </div>
              </Field>
            </div>
            <button
              className={btnCls}
              onClick={() => setSelKey(options[optIdx - 1].y + "-" + options[optIdx - 1].m)}
              disabled={optIdx <= 0}
            >
              ←
            </button>
            <select
              className={inputCls + " w-44"}
              value={sim.y + "-" + sim.m}
              onChange={(e) => setSelKey(e.target.value)}
              title="Mois affiché — 🧾 = mois chargé (données importées)"
            >
              {options.map((s) => (
                <option key={s.y + "-" + s.m} value={s.y + "-" + s.m}>
                  {s.label + (s.hasData ? " 🧾" : "") + (s.historique ? " (historique)" : s.horsFenetre ? " (hors fenêtre)" : "")}
                </option>
              ))}
            </select>
            <button
              className={btnCls}
              onClick={() => setSelKey(options[optIdx + 1].y + "-" + options[optIdx + 1].m)}
              disabled={optIdx < 0 || optIdx >= options.length - 1}
            >
              →
            </button>
            <button
              className={(onlyLoaded
                ? "border-transparent bg-indigo-600 text-white shadow"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100") + " rounded-lg px-3 py-2 text-sm font-medium transition"}
              onClick={() => setOnlyLoaded((v) => !v)}
              title="N'afficher que les mois chargés (dépense non planifiée ou revenu unique, typiquement importés d'un relevé)"
            >
              🧾 Mois chargés
            </button>
            <button className={btnCls} onClick={exportData} title="Télécharger vos données en JSON">📤 Exporter</button>
            <button className={btnCls} onClick={() => fileRef.current && fileRef.current.click()} title="Restaurer depuis un fichier JSON">📥 Importer</button>
            <button className={btnCls} onClick={() => csvRef.current && csvRef.current.click()} title="Importer un relevé bancaire CSV (débit = dépense, crédit = revenu)">🧾 Relevé CSV</button>
            <button className={btnCls} onClick={resetData} title="Effacer les données">♻️</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) importCsvFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
        </header>

        {/* Onglets */}
        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={"rounded-lg px-4 py-2 text-sm font-medium transition " + (
                tab === t.id
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ------------------------------ APERÇU ------------------------------ */}
        {tab === "apercu" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-8">
              <Kpi label="Solde en début de mois" value={fmt(sim.start)} />
              <Kpi label="Revenus du mois" value={"+ " + fmt(sim.totalIn)} tone="good" />
              <Kpi label="Dépenses du mois" value={"− " + fmt(sim.totalOut)} tone="bad" />
              <Kpi
                label="Solde actuel"
                value={fmt(soldeActuel)}
                tone={soldeActuel >= 0 ? "accent" : "bad"}
                hint={isCurrentMonth ? "aujourd'hui" : "au " + now.getDate() + " " + MONTHS[sim.m].toLowerCase()}
              />
              <Kpi
                label="Solde fin de mois"
                value={fmt(sim.end)}
                tone={sim.end >= 0 ? "accent" : "bad"}
                hint={sim.end >= sim.start ? "Évolution : + " + fmt(sim.end - sim.start) : "Évolution : − " + fmt(sim.start - sim.end)}
              />
              <Kpi
                label="Flux épargne net"
                value={
                  (sim.transferIn ?? 0) === 0 && (sim.transferOut ?? 0) === 0
                    ? "—"
                    : (sim.fluxEpargne >= 0 ? "+ " : "− ") + fmt(Math.abs(sim.fluxEpargne))
                }
                tone={sim.fluxEpargne > 0 ? "good" : sim.fluxEpargne < 0 ? "bad" : undefined}
                hint={
                  (sim.transferIn ?? 0) === 0 && (sim.transferOut ?? 0) === 0
                    ? "Aucun transfert interne ce mois-ci"
                    : sim.fluxEpargne < 0
                      ? "⚠️ Réserve sollicitée (retraits " + fmt(sim.transferIn) + " > versements " + fmt(sim.transferOut) + ")"
                      : "Versements " + fmt(sim.transferOut) + " − retraits " + fmt(sim.transferIn) + " (hors budget)"
                }
              />
              <Kpi
                label="Solde fin de mois probable"
                value={fmt(sim.end - prov.total)}
                tone={sim.end - prov.total >= 0 ? "accent" : "bad"}
                hint={
                  prov.total > 0
                    ? "Habitudes non planifiées : − " + fmt(prov.total)
                    : state.extras.length > 0
                      ? "Habitudes non planifiées : aucune provision"
                      : "Importez un relevé pour estimer vos habitudes"
                }
              />
              <Kpi
                label="Tenue sans la réserve"
                value={fmt(sim.end - prov.total - (sim.fluxEpargne ?? 0))}
                tone={sim.end - prov.total - (sim.fluxEpargne ?? 0) >= 0 ? "good" : "bad"}
                hint={
                  "Solde de fin de mois probable hors flux d'épargne" +
                  ((sim.fluxEpargne ?? 0) < 0
                    ? " — le mois " + (sim.end - prov.total - sim.fluxEpargne < 0 ? "ne tient pas" : "tient") + " sans les " + fmt(sim.transferIn - sim.transferOut) + " de retraits"
                    : (sim.fluxEpargne ?? 0) > 0
                      ? " (épargne de " + fmt(sim.fluxEpargne) + " déjà mise de côté)"
                      : " (aucun flux d'épargne ce mois-ci)")
                }
              />
            </div>

            {savingsHist.length > 0 && (
              <Card>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">Épargne — trajectoire sur les mois chargés</h2>
                  {(() => {
                    const last = savingsHist[savingsHist.length - 1];
                    return (
                      <span className={"text-xs font-semibold " + (last.cumul > 0 ? "text-emerald-600" : last.cumul < 0 ? "text-rose-600" : "text-slate-500")}>
                        {savingsHist.length} mois chargé(s) · cumul {last.cumul > 0 ? "+ " + fmt(last.cumul) : last.cumul < 0 ? "− " + fmt(-last.cumul) : fmt(0)}
                        {last.cumul < 0 ? " — la réserve a été sollicitée sur la période" : ""}
                      </span>
                    );
                  })()}
                </div>
                <p className="mb-2 text-xs text-slate-500">
                  Flux net vers l'épargne (versements − retraits) tel que le relevé le montre ; le cumul mesure le progrès vers un budget qui épargne sans piocher dans la réserve.
                </p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={savingsHist.map((h) => ({ mois: MONTHS[h.m].slice(0, 3) + " " + String(h.y).slice(2), net: Math.round(h.net * 100) / 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? (v / 1000) + "k" : String(v))} />
                      <Tooltip formatter={(v) => [fmt(v) + " €", "Flux du mois"]} labelStyle={{ fontWeight: 600 }} />
                      <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                        {savingsHist.map((h, i) => (
                          <Cell key={i} fill={h.net > 0 ? "#10b981" : h.net < 0 ? "#f43f5e" : "#cbd5e1"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            <Card>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Évolution du solde — {sim.label}</h2>
                {sim.min < 0 ? (
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                    ⚠️ Découvert prévu le {sim.minDay} {MONTHS[sim.m].toLowerCase()} ({fmt(sim.min)})
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    Point le plus bas : {fmt(sim.min)} le {sim.minDay} {MONTHS[sim.m].toLowerCase()}
                  </span>
                )}
              </div>
              <p className="mb-3 text-xs text-slate-500">Survolez le graphique pour voir les opérations débitées / créditées chaque jour (🔒 = incompressible).</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sim.daily} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="day"
                      type="number"
                      domain={[0, 31]}
                      ticks={[1, 5, 10, 15, 20, 25, 31]}
                      tickFormatter={(d) => String(d)}
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      tickFormatter={(v) => Math.round(v / 100) / 10 + "k€"}
                      width={48}
                    />
                    <Tooltip content={<BalanceTooltip />} />
                    <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" />
                    <ReferenceLine y={sim.start} stroke="#94a3b8" strokeDasharray="2 4" />
                    <Area type="monotone" dataKey="solde" stroke="#6366f1" strokeWidth={2.5} fill="url(#grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-1 font-semibold">Flux quotidien — {sim.label}</h2>
                <p className="mb-3 text-xs text-slate-500">Opérations du jour : vert = entrées, rouge = sorties.</p>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyFlow} margin={{ top: 10, right: 10, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} interval={1} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => v + "€"} width={48} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length) return null;
                          const day = sim.daily.find((d) => d.day === Number(label));
                          return (
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
                              <div className="font-semibold text-slate-600">{label} {MONTHS[sim.m]}</div>
                              {(day ? day.events : []).map((e, i) => (
                                <div key={i} className="mt-1 flex justify-between gap-6">
                                  <span>{e.label}{e.inc ? " 🔒" : ""}{e.transfer ? " ⇄" : e.rec ? " 🔁" : " ✨"}</span>
                                  <span className={e.type === "in" ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                                    {e.type === "in" ? "+" : "−"}{fmt(Math.abs(e.amount))}
                                  </span>
                                </div>
                              ))}
                              {(!day || day.events.length === 0) && <div className="mt-1 text-slate-400">Aucune opération</div>}
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Bar dataKey="flux" radius={[3, 3, 0, 0]}>
                        {dailyFlow.map((d, i) => (
                          <Cell key={i} fill={d.flux >= 0 ? "#10b981" : "#f43f5e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h2 className="mb-1 font-semibold">Solde prévisionnel fin de mois (12 mois)</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Enchaînement des mois à partir de {monthLabel(anchor.y, anchor.m)} avec le solde de départ de {fmt(state.soldeDepart)}
                  {hist.months.length > 0 && <> ; historique enchaîné jusqu'à {monthLabel(start.y, start.m)} (ouverture : {fmt(sims[0].start)})</>}.
                  <span className="text-amber-600"> Point bas du mois en pointillés : il suit les dates des prélèvements récurrents 🔁, stables d'un mois sur l'autre.</span>
                </p>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={yearData} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => v.split(" ")[0].slice(0, 4)} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => Math.round(v / 100) / 10 + "k€"} width={48} />
                      <Tooltip content={<SimpleTooltip />} />
                      <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="solde"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={(props) => (
                          <circle
                            key={props.payload.label}
                            cx={props.cx}
                            cy={props.cy}
                            r={props.payload.solde < 0 ? 5 : 3.5}
                            fill={props.payload.solde < 0 ? "#f43f5e" : "#6366f1"}
                          />
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey="bas"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ------------------------------ DÉPENSES ------------------------------ */}
        {tab === "depenses" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <h2 className="mb-3 font-semibold">Dépenses planifiées ({state.expenses.length})</h2>
                <div className="space-y-2">
                  {state.expenses.map((e) => {
                    const c = taxCat(e.cat, taxo);
                    const s = taxSub(e.cat, e.sub, taxo);
                    const env = ENVELOPPES.find((x) => x.id === envelopeOf(e.cat, e.sub, taxo));
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{e.label}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>Le {e.day} du mois</span>
                            <span>·</span>
                            {e.freq === "annuelle" ? <span>{MONTHS[(e.month ?? 1) - 1]}</span> : <span>Chaque mois</span>}
                            {isRecurringExpense(e, taxo)
                              ? <RecBadge />
                              : <Badge color="#f59e0b">✨ Non récurrent</Badge>}
                            <Badge color={env ? env.color : "#94a3b8"}>{c ? c.label : "?"}</Badge>
                            {s && <span>{s.label}</span>}
                            {e.incompressible && <IncBadge />}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-rose-600">− {fmt(e.amount)}</span>
                          <button
                            className="rounded-md px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => delExpense(e.id)}
                            title="Supprimer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {state.expenses.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                      Aucune dépense récurrente enregistrée.
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <h2 className="mb-1 font-semibold">Dépenses non planifiées ({state.extras.length})</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Dépenses unitaires, à une date précise : vie courante (l'enveloppe de leur catégorie) ou
                  one-shot — ponctuelles, à durée limitée (enveloppe « Exceptionnelles », exclues des habitudes).
                </p>
                <div className="space-y-2">
                  {state.extras.map((x) => {
                    const c = taxCat(x.cat, taxo);
                    const s = taxSub(x.cat, x.sub, taxo);
                    const shot = extraOneShot(x, taxo);
                    const env = ENVELOPPES.find((x2) => x2.id === (shot ? "exceptionnelles" : envelopeOf(x.cat, x.sub, taxo)));
                    return (
                      <div key={x.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{x.label}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>{monthLabel(x.y, x.m)} · le {x.day}</span>
                            <Badge color={env ? env.color : "#94a3b8"}>{c ? c.label : "?"}</Badge>
                            {s && <span>{s.label}</span>}
                            {shot && <Badge color="#8b5cf6">one-shot</Badge>}
                            {x.incompressible && <IncBadge />}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-rose-600">− {fmt(x.amount)}</span>
                          <button
                            className={
                              "rounded-md px-2 py-1 text-xs font-medium transition " +
                              (shot ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200")
                            }
                            onClick={() => patchExtra(x.id, { oneShot: !shot })}
                            title={shot
                              ? "Basculer en dépense de vie courante (enveloppe de sa catégorie, compte dans les habitudes)"
                              : "Basculer en one-shot (enveloppe « Exceptionnelles », exclue des habitudes)"}
                          >
                            one-shot
                          </button>
                          <button
                            className="rounded-md px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => delExtra(x.id)}
                            title="Supprimer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {state.extras.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                      Aucune dépense non planifiée.
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <ExpenseForm expenses={state.expenses} onAdd={addExpense} taxo={taxo} />
              <ExtraForm sims={sims} monthIdx={simIdx} expenses={state.expenses} onAdd={addExtra} taxo={taxo} />
            </div>
          </div>
        )}

        {/* ------------------------------ REVENUS ------------------------------ */}
        {tab === "revenus" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-1 font-semibold">Entrées d'argent ({state.incomes.length})</h2>
              <p className="mb-3 text-xs text-slate-500">
                Les salaires sont versés l'avant-veille du dernier jour ouvré du mois — ce mois-ci : le {salaryPayDay(sim.y, sim.m)} {MONTHS[sim.m].toLowerCase()}.
              </p>
              <div className="space-y-2">
                {state.incomes.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{i.label}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {i.mode === "unique" ? (
                          <span>Le {i.day} {MONTHS[i.m]} {i.y} · une seule fois</span>
                        ) : i.mode === "salaire" ? (
                          <>
                            <span>Avant-veille du dernier jour ouvré</span>
                            <span>·</span>
                            <span>le {salaryPayDay(sim.y, sim.m)} ce mois-ci</span>
                            {i.treizieme && <Badge color="#10b981">13ᵉ mois en 2 × ½ (juin + nov.)</Badge>}
                            {(i.bonus ?? 0) > 0 && <Badge color="#10b981">Bonus {fmt(i.bonus)} en mars</Badge>}
                          </>
                        ) : (
                          <span>Le {i.day} du mois</span>
                        )}
                        {isRecurringIncome(i, taxo)
                          ? <RecBadge />
                          : i.mode === "unique"
                            ? <Badge color="#f59e0b">✨ Unique</Badge>
                            : <Badge color="#f59e0b">✨ Non récurrent</Badge>}
                        {i.cat && <Badge color="#10b981">{labelOf(i.cat, i.sub, taxo)}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-emerald-600">+ {fmt(i.amount)}</span>
                      <button
                        className="rounded-md px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => delIncome(i.id)}
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {state.incomes.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                    Aucun revenu enregistré.
                  </div>
                )}
              </div>
            </Card>

            <IncomeForm sims={sims} monthIdx={simIdx} onAdd={addIncome} taxo={taxo} />
          </div>
        )}

        {/* ------------------------------ BUDGET ------------------------------ */}
        {tab === "budget" && (
          <div className="space-y-6">
            <Card>
              <h2 className="mb-1 font-semibold">Budget prévisionnel — {sim.label}</h2>
              <p className="mb-4 text-xs text-slate-500">
                Comparez l'enveloppe que vous souhaitez consacrer à chaque type de dépenses avec le total réellement planifié ce mois-ci (récurrentes + non planifiées).
                Les dépenses sont rangées automatiquement par catégorie bancaire.
              </p>
              <div className="space-y-4">
                {ENVELOPPES.map((c) => {
                  const planned = byEnv[c.id] ?? 0;
                  const budget = state.budgets[c.id] ?? 0;
                  const pct = budget > 0 ? Math.min(100, (planned / budget) * 100) : planned > 0 ? 100 : 0;
                  const over = planned > budget;
                  const detail = detailOf(c.id);
                  return (
                    <div key={c.id}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="text-sm font-medium">{c.label}</span>
                          {over && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                              Dépassé de {fmt(planned - budget)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-slate-500">
                            Planifié : <span className={over ? "font-semibold text-rose-600" : "font-semibold text-slate-900"}>{fmt(planned)}</span>
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className="flex items-center gap-1 text-slate-500">
                            Enveloppe :
                            <span className="w-24">
                              <NumInput value={budget} onChange={(n) => setBudget(c.id, n)} />
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: pct + "%", backgroundColor: over ? "#f43f5e" : c.color }}
                        />
                      </div>
                      {detail.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          {detail.map((d, i) => (
                            <span key={i}>
                              {labelOf(d.cat, d.sub, taxo)} : <span className="font-medium text-slate-700">{fmt(d.amount)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-1 font-semibold">Incompressible vs discrétionnaire — {sim.label}</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Les dépenses incompressibles (🔒) sont celles que vous ne pouvez pas reporter ni réduire.
                </p>
                <div className="space-y-4">
                  {[
                    { label: "🔒 Incompressibles", value: agg.incompressible, color: "#475569" },
                    { label: "🎯 Discrétionnaires", value: agg.discretionnaire, color: "#f59e0b" },
                  ].map((row) => {
                    const pct = agg.total > 0 ? Math.round((row.value / agg.total) * 100) : 0;
                    return (
                      <div key={row.label}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium">{row.label}</span>
                          <span className="text-slate-600">
                            <span className="font-semibold">{fmt(row.value)}</span> · {pct} %
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{ width: pct + "%", backgroundColor: row.color }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">
                    Total planifié : <span className="font-semibold text-slate-700">{fmt(agg.total)}</span>
                  </p>
                </div>
              </Card>

              <Card>
                <h2 className="mb-3 font-semibold">Répartition des dépenses du mois par enveloppe</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ENVELOPPES.map((c) => ({ label: c.label, total: byEnv[c.id] ?? 0, color: c.color }))}
                      margin={{ top: 10, right: 10, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => v + "€"} width={56} />
                      <Tooltip content={<SimpleTooltip />} />
                      <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                        {ENVELOPPES.map((c) => (
                          <Cell key={c.id} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ------------------------------ ÉCHÉANCIER ------------------------------ */}
        {tab === "echeancier" && (
          <div className="space-y-6">
            <Card>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Échéancier récurrent 🔁 — {sim.label}</h2>
                <span className="text-xs text-slate-500">
                  {recTotals.days} jour(s) d'échéance · {recTotals.count} opération(s) · débits − {fmt(recTotals.totalOut)} · crédits + {fmt(recTotals.totalIn)}
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Seuls les couples marqués « récurrente 🔁 » dans la nomenclature (console 🛠️ Admin)
                y figurent : ce sont eux qui dessinent la trajectoire du solde et les point bas des
                mois à venir. Le solde indiqué est celui de fin de journée dans la simulation du mois.
              </p>
              <div className="flex flex-wrap gap-2">
                {echeancier.map((d) => (
                  <div key={d.day} className="min-w-[10rem] rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-700">Le {d.day}</div>
                    {d.ops.map((op, i) => (
                      <div key={i} className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-slate-600">{op.label}{op.inc ? " 🔒" : ""}</span>
                        <span className={op.type === "in" ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                          {op.type === "in" ? "+" : "−"}{fmt(Math.abs(op.amount))}
                        </span>
                      </div>
                    ))}
                    <div className={"mt-1 border-t border-slate-100 pt-1 font-semibold " + (d.total >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      Net : {d.total >= 0 ? "+" : "−"}{fmt(Math.abs(d.total))}
                    </div>
                    <div className="mt-0.5 text-slate-400">Solde : {fmt(sim.daily[d.day]?.solde ?? sim.end)}</div>
                  </div>
                ))}
                {echeancier.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                    Aucune échéance récurrente ce mois-ci.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Habitudes non planifiées — provision restante</h2>
                <span className="text-xs font-semibold text-rose-600">− {fmt(prov.total)}</span>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Tendance par couple sans écriture planifiée, apprise des relevés importés :
                {est.stat === "moyenne" ? "moyenne" : "médiane"} des mois observés sur une fenêtre de {est.window} mois complets
                (zéros inclus), provisionnée si le couple est présent dans au moins
                {Math.round(est.presenceMin * 100)} % des mois — les dépenses one-shot
                n'influencent pas la prévision. Restant = tendance − déjà dépensé ce mois-ci
                (les couples planifiés sont exclus : pas de double comptage). Réglages dans 🛠️ Admin.
                {isCurrentMonth && prov.total > 0 && (
                  <> À lisser sur les {daysInMonth(sim.y, sim.m) - now.getDate()} jour(s) restant(s), réactualisé à chaque import.</>
                )}
              </p>
              <div className="space-y-2">
                {prov.lines.map((l) => (
                  <div key={l.cat + "|" + l.sub} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-slate-700">{labelOf(l.cat, l.sub, taxo)}</span>
                    <span className="text-slate-500">
                      tendance {fmt(l.tendency)} · dépensé {fmt(l.spent)} ·{" "}
                      <span className="font-semibold text-rose-600">restant {fmt(l.left)}</span>
                    </span>
                  </div>
                ))}
                {prov.lines.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                    {state.extras.length > 0
                      ? "Aucune habitude non planifiée détectée pour ce mois."
                      : "Importez un relevé pour que l'application apprenne vos habitudes."}
                  </div>
                )}
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-1 font-semibold">Calendrier type des récurrents</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Paiements et revenus des couples marqués 🔁, à leurs dates habituelles
                  (les mois courts ramènent le jour 31 en fin de mois). Marquez une sous-catégorie
                  🔁 dans la console 🛠️ Admin pour la voir apparaître ici.
                </p>
                <div className="space-y-2">
                  {[
                    ...state.expenses.filter((e) => isRecurringExpense(e, taxo)).map((e) => ({
                      key: e.id,
                      label: e.label,
                      amount: -e.amount,
                      day: e.day,
                      when: e.freq === "annuelle" ? "Chaque " + MONTHS[(e.month ?? 1) - 1].toLowerCase() : "Chaque mois",
                      inc: !!e.incompressible,
                    })),
                    ...state.incomes.filter((i) => isRecurringIncome(i, taxo)).map((i) => ({
                      key: i.id,
                      label: i.label + (i.treizieme ? " (½ 13ᵉ mois en juin + nov.)" : "") + ((i.bonus ?? 0) > 0 ? " (bonus en mars)" : ""),
                      amount: i.amount,
                      day: i.mode === "salaire" ? salaryPayDay(sim.y, sim.m) : (i.day ?? 1),
                      when: i.mode === "salaire" ? "Avant-veille du dernier jour ouvré" : "Jour fixe du mois",
                      inc: false,
                    })),
                  ]
                    .sort((a, b) => a.day - b.day)
                    .map((r) => (
                      <div key={r.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="truncate font-medium text-slate-700">{r.label}</span>
                          <span className="text-slate-500"> · le {r.day} · {r.when}</span>
                        </div>
                        <span className={r.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                          {r.amount >= 0 ? "+" : "−"}{fmt(Math.abs(r.amount))}{r.inc ? " 🔒" : ""}
                        </span>
                      </div>
                    ))}
                  {state.expenses.filter((e) => isRecurringExpense(e, taxo)).length + state.incomes.filter((i) => isRecurringIncome(i, taxo)).length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                      Aucun récurrent enregistré.
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <h2 className="mb-1 font-semibold">12 mois — échéances récurrentes et point bas</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Pour chaque mois simulé : débits et crédits récurrents uniquement, puis point bas de la trajectoire (suivant ces dates stables) et solde en fin de mois.
                </p>
