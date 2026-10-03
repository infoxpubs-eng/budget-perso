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
  extras: [], // rien d'exceptionnel par défaut : seules les situations
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
      <div className={"mt-1 text-2xl font-bold " + toneCls}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
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
                {e.rec ? " 🔁" : " ✨"}
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
  const anchor = useMemo(() => simStart(state, start.y, start.m), [state, start]);

  const hist = useMemo(() => {
    const months = [];
    let carry = state.soldeDepart;
    let y = anchor.y;
    let m = anchor.m;
    while (y < start.y || (y === start.y && m < start.m)) {
      const month = monthSim(state, y, m, carry);
      months.push(month);
      carry = month.end;
      const d = new Date(y, m + 1, 1);
      y = d.getFullYear();
      m = d.getMonth();
    }
    return { months, opening: carry };
  }, [state, anchor, start]);

  const sims = useMemo(() => simulate(state, start.y, start.m, hist.opening), [state, start, hist.opening]);

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
        const month = monthSim(state, d.y, d.m, carry);
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

  const sim = options.find((s) => s.y + "-" + s.m === selKey) ?? options[0] ?? sims[0];
  const optIdx = options.indexOf(sim);
  // Index du mois affiché dans les 12 mois simulés (les formulaires ne
  // proposent que la fenêtre) ; 0 si le mois affiché est hors fenêtre.
  const simIdx = Math.max(0, sims.findIndex((s) => s.y === sim.y && s.m === sim.m));

  // Solde « actuel » : solde du mois affiché à la date d'aujourd'hui
  // (jour clampé au nombre de jours du mois ; projection pour un mois
  // autre que le mois en cours).
  const todayDay = Math.min(now.getDate(), sim.daily.length - 1);
  const soldeActuel = sim.daily[todayDay].solde;
  const isCurrentMonth = sim.y === now.getFullYear() && sim.m === now.getMonth();

  const setSolde = (n) => setState((s) => ({ ...s, soldeDepart: n }));

  const addExpense = (e) => setState((s) => ({ ...s, expenses: [...s.expenses, e] }));
  const delExpense = (id) => setState((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== id) }));
  const addExtra = (x) => setState((s) => ({ ...s, extras: [...s.extras, x] }));
  const delExtra = (id) => setState((s) => ({ ...s, extras: s.extras.filter((x) => x.id !== id) }));
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
    () => remainingProvision({ extras: state.extras, expenses: state.expenses, y: sim.y, m: sim.m, settings: est }),
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
              title="Mois affiché — 🧾 = mois chargé (données importées ou exceptionnelles)"
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
              title="N'afficher que les mois chargés (dépense exceptionnelle ou revenu unique, typiquement importés d'un relevé)"
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
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
            </div>

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
                                  <span>{e.label}{e.inc ? " 🔒" : ""}{e.rec ? " 🔁" : " ✨"}</span>
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
                <h2 className="mb-1 font-semibold">Dépenses exceptionnelles ({state.extras.length})</h2>
                <p className="mb-3 text-xs text-slate-500">Dépenses unitaires, à une date précise.</p>
                <div className="space-y-2">
                  {state.extras.map((x) => {
                    const c = taxCat(x.cat, taxo);
                    const s = taxSub(x.cat, x.sub, taxo);
                    const env = ENVELOPPES.find((x2) => x2.id === "exceptionnelles");
                    return (
                      <div key={x.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{x.label}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>{monthLabel(x.y, x.m)} · le {x.day}</span>
                            <Badge color={env ? env.color : "#94a3b8"}>{c ? c.label : "?"}</Badge>
                            {s && <span>{s.label}</span>}
                            {x.incompressible && <IncBadge />}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-rose-600">− {fmt(x.amount)}</span>
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
                      Aucune dépense exceptionnelle.
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
                Comparez l'enveloppe que vous souhaitez consacrer à chaque type de dépenses avec le total réellement planifié ce mois-ci (récurrentes + exceptionnelles).
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
                {Math.round(est.presenceMin * 100)} % des mois — les dépenses exceptionnelles
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1.5 pr-2 font-medium">Mois</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Éch.</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Débits 🔁</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Crédits 🔁</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Point bas</th>
                        <th className="py-1.5 font-medium text-right">Fin de mois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recYear.map((r, i) => (
                        <tr key={i} className={"border-b border-slate-100" + (r.label === sim.label ? " bg-indigo-50/50" : "")}>
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{r.label}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-500">{r.days} j</td>
                          <td className="py-1.5 pr-2 text-right text-rose-600">− {fmt(r.totalOut)}</td>
                          <td className="py-1.5 pr-2 text-right text-emerald-600">+ {fmt(r.totalIn)}</td>
                          <td className={"py-1.5 pr-2 text-right font-semibold " + (r.min < 0 ? "text-rose-600" : "text-amber-600")}>
                            {fmt(r.min)}{r.min < 0 ? " ⚠️" : ""}
                          </td>
                          <td className={"py-1.5 text-right font-semibold " + (r.end < 0 ? "text-rose-600" : "text-slate-700")}>{fmt(r.end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ------------------------------ ADMIN ------------------------------ */}
        {tab === "admin" && <AdminPanel state={state} setState={setState} prov={prov} simLabel={sim.label} />}

        {/* ----------------------- DIALOGUE IMPORT CSV ----------------------- */}
        {csvImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold">Import du relevé</h2>
              <p className="mt-1 text-sm text-slate-500">
                {csvImport.parsed.rows.length + csvImport.parsed.ignored} ligne(s) chargée(s) ·{" "}
                {csvImport.r.couvertesOut +
                  csvImport.r.couvertesIn +
                  csvImport.r.extras.length +
                  csvImport.r.incomes.length +
                  csvImport.r.recurrentes.length}{" "}
                intégrée(s) · {csvImport.parsed.ignored} ignorée(s)
              </p>

              <div className="mt-4 flex-1 space-y-2 overflow-y-auto text-sm">
                {csvImport.r.newExpenses.length > 0 && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="font-medium text-slate-700">
                      {csvImport.r.newExpenses.length} écriture(s) récurrente(s) planifiée(s)
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {csvImport.r.newExpenses.map((e) => (
                        <li key={e.id}>
                          · {e.label} — {fmt(e.amount)} le {e.day} du mois{e.incompressible ? " 🔒" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {csvImport.r.newIncomes.length > 0 && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="font-medium text-slate-700">
                      {csvImport.r.newIncomes.length} revenu(s) récurrent(s) planifié(s)
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {csvImport.r.newIncomes.map((x) => (
                        <li key={x.id}>· {x.label} — {fmt(x.amount)} le {x.day} du mois</li>
                      ))}
                    </ul>
                  </div>
                )}
                {csvImport.r.extras.length > 0 && (
                  <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                    {csvImport.r.extras.length} dépense(s) exceptionnelle(s), total {fmt(csvImport.r.depensesTotal)}
                  </div>
                )}
                {csvImport.r.incomes.length > 0 && (
                  <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                    {csvImport.r.incomes.length} revenu(s) unique(s), total {fmt(csvImport.r.revenusTotal)}
                  </div>
                )}
                {csvImport.r.recurrentes.length > 0 && (
                  <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                    {csvImport.r.recurrentes.length} ligne(s) déjà couverte(s) par une écriture planifiée (non
                    importées en double)
                  </div>
                )}
                {(csvImport.r.newExpenses.length > 0 || csvImport.r.recurrentes.length > 0) && (
                  <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    Les dates réelles et les montants observés des couples 🔁 sont conservés sur leurs
                    écritures (historique pour le futur suivi réel vs prévisionnel) ; un même relevé
                    réimporté n'ajoute aucun doublon. Le montant prévisionnel d'une écriture 🔁
                    rattachée suit la dernière occurrence observée.
                  </div>
                )}

                {csvImport.r.taxoAdditions.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="font-semibold text-amber-800">
                      {csvImport.r.taxoAdditions.length} couple(s) absent(s) de la nomenclature
                    </div>
                    <p className="mt-1 text-xs text-amber-700">
                      Rangez chaque couple dans une catégorie (défaut « À classer ») et renommez-le si besoin ;
                      les écritures correspondantes suivront.
                    </p>
                    <div className="mt-2 space-y-2">
                      {csvImport.r.taxoAdditions.map((a, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-600">
                            {a.label} · {a.nature === "revenu" ? "revenu" : "dépense"} →
                          </span>
                          <input
                            type="text"
                            className={inputCls + " min-w-[8rem] flex-1"}
                            value={csvImport.choices[i]?.label ?? a.label}
                            onChange={(e) => setCsvChoice(i, { label: e.target.value })}
                            title="Libellé du couple"
                          />
                          <select
                            className={inputCls}
                            value={csvImport.choices[i]?.cat ?? A_CLASSER}
                            onChange={(e) => setCsvChoice(i, { cat: e.target.value })}
                            title="Catégorie d'accueil"
                          >
                            <option value={A_CLASSER}>À classer</option>
                            {(a.nature === "revenu"
                              ? taxo.filter((c) => c.active !== false && c.nature === "revenu")
                              : taxo.filter((c) => c.active !== false && c.nature === "depense")
                            )
                              .filter((c) => c.id !== A_CLASSER)
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                              ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button className={btnCls} onClick={() => setCsvImport(null)}>
                  Annuler
                </button>
                <button
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  onClick={confirmCsvImport}
                >
                  Importer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== Formulaires ============================== */

/**
 * Pour chaque couple catégorie|sous-catégorie : nombre de dépenses récurrentes
 * qui l'utilisent déjà, dont combien d'incompressibles, et leurs libellés
 * (3 premiers). Sert à identifier les sous-catégories récurrentes dans les
 * formulaires de dépense.
 */
function recurrencesBySub(expenses) {
  const map = new Map();
  for (const e of expenses ?? []) {
    if (!e.sub) continue;
    const k = (e.cat ?? "") + "|" + e.sub;
    const cur = map.get(k) ?? { count: 0, inc: 0, labels: [] };
    cur.count++;
    if (e.incompressible) cur.inc++;
    if (cur.labels.length < 3) cur.labels.push(e.label);
    map.set(k, cur);
  }
  return map;
}

function ExpenseForm({ expenses = [], onAdd, taxo = TAXONOMIE }) {
  const DEPCATS = useMemo(() => depenseCats(taxo), [taxo]);
  const recBySub = useMemo(() => recurrencesBySub(expenses), [expenses]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(1);
  const [cat, setCat] = useState("logement");
  const [sub, setSub] = useState("loyers-charges");
  const [freq, setFreq] = useState("mensuelle");
  const [month, setMonth] = useState(1);
  const [inc, setInc] = useState(false);

  const subs = DEPCATS.find((c) => c.id === cat)?.subs ?? [];

  const changeCat = (id) => {
    setCat(id);
    const first = DEPCATS.find((c) => c.id === id)?.subs[0];
    setSub(first?.id ?? "");
    setInc(!!first?.incompressible);
  };

  const changeSub = (id) => {
    setSub(id);
    setInc(!!subs.find((s) => s.id === id)?.incompressible);
  };

  const submit = () => {
    if (!label.trim() || amount <= 0) return;
    onAdd({
      id: uuid(),
      label: label.trim(),
      amount,
      day: Math.min(31, Math.max(1, day)),
      cat,
      sub: sub || undefined,
      freq,
      month: freq === "annuelle" ? month : undefined,
      incompressible: inc,
    });
    setLabel("");
    setAmount(0);
    setDay(1);
    setInc(false);
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Ajouter une dépense récurrente</h2>
      <div className="space-y-3">
        <Field label="Libellé">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Loyer" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (€)">
            <NumInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Jour du mois (1–31)">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Catégorie">
            <select className={inputCls} value={cat} onChange={(e) => changeCat(e.target.value)}>
              {DEPCATS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Sous-catégorie">
            <select className={inputCls} value={sub} onChange={(e) => changeSub(e.target.value)} disabled={subs.length === 0}>
              {subs.length === 0 && <option value="">—</option>}
              {subs.map((s) => {
                const rec = recBySub.get(cat + "|" + s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.label + (rec ? " · récurrente" : "") + (s.incompressible || rec?.inc ? " 🔒" : "") + (s.recurring ? " 🔁" : "")}
                  </option>
                );
              })}
            </select>
          </Field>
        </div>
        {recBySub.get(cat + "|" + sub) && (
          <p className="text-xs text-amber-700">
            {"⚠️ Sous-catégorie déjà couverte par " +
              recBySub.get(cat + "|" + sub).count +
              " dépense(s) récurrente(s)" +
              (recBySub.get(cat + "|" + sub).inc > 0
                ? ", dont " + recBySub.get(cat + "|" + sub).inc + " incompressible(s) 🔒"
                : "") +
              " (" + recBySub.get(cat + "|" + sub).labels.join(", ") + ")"}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fréquence">
            <select className={inputCls} value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="mensuelle">Mensuelle</option>
              <option value="annuelle">Annuelle</option>
            </select>
          </Field>
          {freq === "annuelle" && (
            <Field label="Mois">
              <select className={inputCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <CheckRow checked={inc} onChange={setInc} label="Dépense incompressible 🔒" />
        <button
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          onClick={submit}
          disabled={!label.trim() || amount <= 0}
        >
          Ajouter la dépense
        </button>
      </div>
    </Card>
  );
}

function ExtraForm({ sims, monthIdx, expenses = [], onAdd, taxo = TAXONOMIE }) {
  const DEPCATS = useMemo(() => depenseCats(taxo), [taxo]);
  const recBySub = useMemo(() => recurrencesBySub(expenses), [expenses]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(1);
  const [simIdx, setSimIdx] = useState(monthIdx);
  const [cat, setCat] = useState("logement");
  const [sub, setSub] = useState("frais-exceptionnels");
  const [inc, setInc] = useState(false);

  // Suit le mois sélectionné en en-tête tant que l'utilisateur n'a pas choisi
  useEffect(() => { setSimIdx(monthIdx); }, [monthIdx]);

  const subs = DEPCATS.find((c) => c.id === cat)?.subs ?? [];

  const changeCat = (id) => {
    setCat(id);
    const first = DEPCATS.find((c) => c.id === id)?.subs[0];
    setSub(first?.id ?? "");
    setInc(!!first?.incompressible);
  };

  const changeSub = (id) => {
    setSub(id);
    setInc(!!subs.find((s) => s.id === id)?.incompressible);
  };

  const target = sims[Math.min(simIdx, 11)];
  const submit = () => {
    if (!label.trim() || amount <= 0) return;
    onAdd({
      id: uuid(),
      label: label.trim(),
      amount,
      day: Math.min(31, Math.max(1, day)),
      y: target.y,
      m: target.m,
      cat,
      sub: sub || undefined,
      incompressible: inc,
    });
    setLabel("");
    setAmount(0);
    setDay(1);
    setInc(false);
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Ajouter une dépense exceptionnelle</h2>
      <p className="mb-3 text-xs text-slate-500">Dépense unitaire, une seule fois, à une date précise.</p>
      <div className="space-y-3">
        <Field label="Libellé">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Réparation voiture" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (€)">
            <NumInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Jour du mois (1–31)">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Mois">
          <select className={inputCls} value={simIdx} onChange={(e) => setSimIdx(Number(e.target.value))}>
            {sims.map((s, i) => (
              <option key={i} value={i}>{s.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Catégorie">
            <select className={inputCls} value={cat} onChange={(e) => changeCat(e.target.value)}>
              {DEPCATS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Sous-catégorie">
            <select className={inputCls} value={sub} onChange={(e) => changeSub(e.target.value)} disabled={subs.length === 0}>
              {subs.length === 0 && <option value="">—</option>}
              {subs.map((s) => {
                const rec = recBySub.get(cat + "|" + s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.label + (rec ? " · récurrente" : "") + (s.incompressible || rec?.inc ? " 🔒" : "") + (s.recurring ? " 🔁" : "")}
                  </option>
                );
              })}
            </select>
          </Field>
        </div>
        <CheckRow checked={inc} onChange={setInc} label="Dépense incompressible 🔒" />
        <button
          className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
          onClick={submit}
          disabled={!label.trim() || amount <= 0}
        >
          Ajouter la dépense exceptionnelle
        </button>
      </div>
    </Card>
  );
}

function IncomeForm({ sims, monthIdx, onAdd, taxo = TAXONOMIE }) {
  const ROPTS = useMemo(() => revenuOptions(taxo), [taxo]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("salaire");
  const [day, setDay] = useState(27);
  const [treizieme, setTreizieme] = useState(false);
  const [bonus, setBonus] = useState(0);
  const [rcat, setRcat] = useState("revenus-travail|salaire-fixe");
  const [uIdx, setUIdx] = useState(monthIdx);

  // Suit le mois sélectionné en en-tête tant que l'utilisateur n'a pas choisi
  useEffect(() => { setUIdx(monthIdx); }, [monthIdx]);

  const target = sims[Math.min(uIdx, 11)];

  const submit = () => {
    if (!label.trim() || amount <= 0) return;
    const [cat, sub] = rcat.split("|");
    onAdd({
      id: uuid(),
      label: label.trim(),
      amount,
      mode,
      day: mode === "salaire" ? undefined : Math.min(31, Math.max(1, day)),
      y: mode === "unique" ? target.y : undefined,
      m: mode === "unique" ? target.m : undefined,
      treizieme: mode === "salaire" ? treizieme : false,
      bonus: mode === "salaire" ? bonus : 0,
      cat,
      sub: sub || undefined,
    });
    setLabel("");
    setAmount(0);
    setTreizieme(false);
    setBonus(0);
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Ajouter une entrée d'argent</h2>
      <div className="space-y-3">
        <Field label="Libellé">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Salaire" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (€)">
            <NumInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Mode de versement">
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="salaire">Salaire (avant-veille du dernier jour ouvré)</option>
              <option value="fixe">Jour fixe du mois (récurrent)</option>
              <option value="unique">Revenu unique (une seule fois)</option>
            </select>
          </Field>
        </div>
        {mode === "fixe" && (
          <Field label="Jour du mois (1–31)">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </Field>
        )}
        {mode === "unique" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jour du mois (1–31)">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
              />
            </Field>
            <Field label="Mois">
              <select className={inputCls} value={uIdx} onChange={(e) => setUIdx(Number(e.target.value))}>
                {sims.map((s, i) => (
                  <option key={i} value={i}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Catégorie bancaire">
          <select className={inputCls} value={rcat} onChange={(e) => setRcat(e.target.value)}>
            {ROPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        {mode === "salaire" && (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <CheckRow
              checked={treizieme}
              onChange={setTreizieme}
              label="13ᵉ mois en 2 fois : ½ versée avec le salaire de juin, ½ avec celui de novembre"
            />
            <Field label="Bonus estimé, versé avec le salaire de mars (€)">
              <NumInput value={bonus} onChange={setBonus} />
            </Field>
          </div>
        )}
        <button
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          onClick={submit}
          disabled={!label.trim() || amount <= 0}
        >
          Ajouter le revenu
        </button>
      </div>
    </Card>
  );
}

/* ============================== Console d'administration ============================== */

/**
 * Nomenclature bancaire : liste des couples catégorie / sous-catégorie,
 * indicateurs « récurrente 🔁 » / « incompressible 🔒 » modifiables en un
 * clic, et ajout d'un couple (sous-catégorie dans une catégorie existante
 * ou nouvelle catégorie). La nomenclature est persistée dans l'état
 * (state.taxonomie) et utilisée par les formulaires, l'import CSV et les
 * totaux du mois.
 */
function AdminPanel({ state, setState, prov, simLabel }) {
  const taxo = state.taxonomie ?? TAXONOMIE;

  // Nombre de dépenses récurrentes utilisant chaque couple cat|sub
  const useBySub = useMemo(() => {
    const m = new Map();
    for (const e of state.expenses ?? []) {
      const k = (e.cat ?? "") + "|" + (e.sub ?? "");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [state.expenses]);

  const [mode, setMode] = useState("existante"); // "existante" | "nouvelle"
  const [catId, setCatId] = useState(taxo[0]?.id ?? "");
  const [catLabel, setCatLabel] = useState("");
  const [catNature, setCatNature] = useState("depense");
  const [catEnv, setCatEnv] = useState("domestiques");
  const [subLabel, setSubLabel] = useState("");
  const [subNat, setSubNat] = useState("auto"); // auto | depense | revenu
  const [recurring, setRecurring] = useState(false);
  const [incompressible, setIncompressible] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // Élément en cours de renommage : { type: "cat"|"sub", catId, subId? }
  const [editing, setEditing] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  const toggleFlag = (cid, sub, flag) =>
    setState((s) => ({
      ...s,
      taxonomie: setSubFlags(s.taxonomie ?? taxo, cid, sub.id, {
        recurring: flag === "recurring" ? !sub.recurring : !!sub.recurring,
        incompressible: flag === "incompressible" ? !sub.incompressible : !!sub.incompressible,
      }),
    }));

  const startEdit = (type, cid, sid, current) => {
    setEditing({ type, catId: cid, subId: sid });
    setEditLabel(current);
    setErr("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditLabel("");
  };

  const confirmEdit = () => {
    setErr("");
    try {
      setState((s) => ({
        ...s,
        taxonomie:
          editing.type === "cat"
            ? renameCategory(s.taxonomie ?? taxo, editing.catId, editLabel)
            : renameSubcategory(s.taxonomie ?? taxo, editing.catId, editing.subId, editLabel),
      }));
      setEditing(null);
      setEditLabel("");
    } catch (e) {
      setErr(e.message);
    }
  };

  const toggleActive = (cid, sid, active) => {
    setErr("");
    try {
      setState((s) => ({
        ...s,
        taxonomie: sid
          ? setSubActive(s.taxonomie ?? taxo, cid, sid, active)
          : setCategoryActive(s.taxonomie ?? taxo, cid, active),
      }));
    } catch (e) {
      setErr(e.message);
    }
  };

  const submit = () => {
    setErr("");
    setOkMsg("");
    try {
      let next = state.taxonomie ?? taxo;
      let targetCat = catId;
      let msgCat = "";
      if (mode === "nouvelle") {
        next = addCategory(next, { label: catLabel, nature: catNature, env: catEnv });
        targetCat = next[next.length - 1].id;
        setCatId(targetCat);
        msgCat = catLabel.trim() + " · ";
      }
      next = addSubcategory(next, targetCat, {
        label: subLabel,
        recurring,
        incompressible,
        nature: subNat === "auto" ? undefined : subNat,
      });
      setState((s) => ({ ...s, taxonomie: next }));
      setOkMsg("✅ " + msgCat + subLabel.trim() + " ajouté à la nomenclature");
      setCatLabel("");
      setSubLabel("");
      setRecurring(false);
      setIncompressible(false);
      setSubNat("auto");
      setMode("existante");
    } catch (e) {
      setErr(e.message);
    }
  };

  const est = state.estimation ?? DEFAULT_ESTIMATION;
  const setEst = (key, value) =>
    setState((s) => ({ ...s, estimation: { ...(s.estimation ?? DEFAULT_ESTIMATION), [key]: value } }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <h2 className="mb-1 font-semibold">Modèle prédictif — habitudes non planifiées</h2>
          <p className="mb-4 text-xs text-slate-500">
            Réglages de la provision qui retranche le KPI « Solde fin de mois probable » (onglet
            Aperçu) : fenêtre d'apprentissage (mois complets, zéros inclus), présence minimale
            (fraction des mois de la fenêtre — en dessous de la moitié, une médiane à zéros
            inclus est déjà nulle : le seuil ne mord alors pas), statistique de tendance
            (la médiane ignore les extrêmes, la moyenne suit les gros mois). Sans relevé
            importé, la provision est nulle ; les réglages sont persistés avec l'état.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fenêtre (mois)">
              <div title="Fenêtre d'apprentissage (1 à 24 mois complets)">
                <NumInput value={est.window} onChange={(v) => setEst("window", Math.max(1, Math.min(24, Math.round(v))))} />
              </div>
            </Field>
            <Field label="Présence minimale (%)">
              <div title="Présence minimale dans la fenêtre (0 à 100 %)">
                <NumInput value={Math.round(est.presenceMin * 100)} onChange={(v) => setEst("presenceMin", Math.max(0, Math.min(100, Math.round(v))) / 100)} />
              </div>
            </Field>
            <Field label="Statistique">
              <select
                className={inputCls}
                title="Statistique de tendance"
                value={est.stat}
                onChange={(e) => setEst("stat", e.target.value)}
              >
                <option value="mediane">Médiane (ignore les extrêmes)</option>
                <option value="moyenne">Moyenne (suit les gros mois)</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Provision « habitudes » de {simLabel ?? "ce mois"} :{" "}
            <span className="font-semibold text-rose-600">− {fmt(prov?.total ?? 0)}</span>{" "}
            sur {prov?.lines.length ?? 0} couple(s) — recalculée à chaque réglage.
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Nomenclature — catégories et sous-catégories</h2>
          <p className="mb-4 text-xs text-slate-500">
            Cliquez sur 🔁 ou 🔒 pour marquer une sous-catégorie récurrente ou incompressible ;
            sur ✏️ pour renommer ; sur ⏸️ pour désactiver (▶️ pour réactiver).
            Une sous-catégorie incompressible rend toutes ses dépenses incompressibles dans les
            totaux du mois et coche automatiquement « incompressible » dans les formulaires.
            Un élément désactivé disparaît des formulaires et de l'import CSV, mais les dépenses
            existantes conservent leurs données et restent comptées dans les totaux.
          </p>
          <div className="space-y-3">
            {taxo.map((c) => {
              const env = ENVELOPPES.find((x) => x.id === c.env);
              return (
                <div key={c.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    {editing && editing.type === "cat" && editing.catId === c.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <input
                          autoFocus
                          className={inputCls}
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <button title="Valider" onClick={confirmEdit}
                          className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50">✓</button>
                        <button title="Annuler" onClick={cancelEdit}
                          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-200">✕</button>
                      </div>
                    ) : (
                      <>
                        <span className={"text-sm font-semibold" + (c.active === false ? " text-slate-400 line-through" : "")}>{c.label}</span>
                        {c.active === false && <Badge color="#94a3b8">désactivée</Badge>}
                      </>
                    )}
                    <Badge color={c.nature === "revenu" ? "#10b981" : "#64748b"}>
                      {c.nature === "revenu" ? "revenu" : "dépense"}
                    </Badge>
                    {env && <Badge color={env.color}>{env.label}</Badge>}
                    <span className="text-xs text-slate-400">{c.subs.length} sous-catégorie(s)</span>
                    <div className="ml-auto flex gap-1">
                      <button title="Renommer" onClick={() => startEdit("cat", c.id, null, c.label)}
                        className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600">✏️</button>
                      <button
                        title={c.active === false ? "Réactiver" : "Désactiver"}
                        onClick={() => toggleActive(c.id, null, c.active === false)}
                        className={"rounded-md px-2 py-1 text-xs transition " + (
                          c.active === false
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        )}
                      >
                        {c.active === false ? "▶️" : "⏸️"}
                      </button>
                    </div>
                  </div>
                  {c.subs.length > 0 && (
                    <div className="divide-y divide-slate-100">
                      {c.subs.map((s) => {
                        const used = useBySub.get(c.id + "|" + s.id) ?? 0;
                        return (
                          <div
                            key={s.id}
                            className={
                              "flex flex-wrap items-center justify-between gap-2 px-3 py-2" +
                              (s.active === false ? " opacity-60" : "")
                            }
                          >
                            {editing && editing.type === "sub" && editing.catId === c.id && editing.subId === s.id ? (
                              <div className="flex min-w-0 flex-1 items-center gap-1">
                                <input
                                  autoFocus
                                  className={inputCls}
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") confirmEdit();
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                />
                                <button title="Valider" onClick={confirmEdit}
                                  className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50">✓</button>
                                <button title="Annuler" onClick={cancelEdit}
                                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-200">✕</button>
                              </div>
                            ) : (
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className={"text-sm" + (s.active === false ? " text-slate-400 line-through" : "")}>{s.label}</span>
                                {s.active === false && <Badge color="#94a3b8">désactivée</Badge>}
                                {subNature(c, s) === "revenu" && c.nature === "depense" && (
                                  <Badge color="#10b981">revenu</Badge>
                                )}
                                {used > 0 && (
                                  <span className="text-xs text-slate-400">
                                    {used} dépense(s) récurrente(s)
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex gap-1">
                              <button title="Renommer" onClick={() => startEdit("sub", c.id, s.id, s.label)}
                                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600">✏️</button>
                              <button
                                title={s.active === false ? "Réactiver" : "Désactiver"}
                                onClick={() => toggleActive(c.id, s.id, s.active === false)}
                                className={"rounded-md px-2 py-1 text-xs transition " + (
                                  s.active === false
                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                )}
                              >
                                {s.active === false ? "▶️" : "⏸️"}
                              </button>
                              <button
                                title="Marquer comme récurrente"
                                onClick={() => toggleFlag(c.id, s, "recurring")}
                                className={
                                  "rounded-md px-2 py-1 text-xs font-medium transition " +
                                  (s.recurring
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200")
                                }
                              >
                                🔁 récurrente
                              </button>
                              <button
                                title="Marquer comme incompressible"
                                onClick={() => toggleFlag(c.id, s, "incompressible")}
                                className={
                                  "rounded-md px-2 py-1 text-xs font-medium transition " +
                                  (s.incompressible
                                    ? "bg-rose-600 text-white"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200")
                                }
                              >
                                🔒 incompressible
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-1 font-semibold">Ajouter un couple (catégorie · sous-catégorie)</h2>
          <p className="mb-3 text-xs text-slate-500">
            La nouvelle sous-catégorie est immédiatement disponible dans les formulaires et
            l'import CSV.
          </p>
          <div className="space-y-3">
            <Field label="Catégorie">
              <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="existante">Catégorie existante…</option>
                <option value="nouvelle">➕ Nouvelle catégorie</option>
              </select>
            </Field>
            {mode === "existante" ? (
              <Field label="Choisir la catégorie">
                <select className={inputCls} value={catId} onChange={(e) => setCatId(e.target.value)}>
                  {taxo.filter((c) => c.active !== false).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Libellé de la catégorie">
                  <input
                    className={inputCls}
                    value={catLabel}
                    onChange={(e) => setCatLabel(e.target.value)}
                    placeholder="Ex. Assurance vie"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nature">
                    <select className={inputCls} value={catNature} onChange={(e) => setCatNature(e.target.value)}>
                      <option value="depense">Dépense</option>
                      <option value="revenu">Revenu</option>
                    </select>
                  </Field>
                  {catNature === "depense" && (
                    <Field label="Enveloppe budgétaire">
                      <select className={inputCls} value={catEnv} onChange={(e) => setCatEnv(e.target.value)}>
                        {ENVELOPPES.filter((x) => x.id !== "exceptionnelles").map((x) => (
                          <option key={x.id} value={x.id}>{x.label}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              </>
            )}
            <Field label="Libellé de la sous-catégorie">
              <input
                className={inputCls}
                value={subLabel}
                onChange={(e) => setSubLabel(e.target.value)}
                placeholder="Ex. Cotisation annuelle"
              />
            </Field>
            <Field label="Nature de la sous-catégorie">
              <select className={inputCls} value={subNat} onChange={(e) => setSubNat(e.target.value)}>
                <option value="auto">Comme la catégorie</option>
                <option value="depense">Dépense</option>
                <option value="revenu">Revenu</option>
              </select>
            </Field>
            <CheckRow checked={recurring} onChange={setRecurring} label="Sous-catégorie récurrente 🔁" />
            <CheckRow checked={incompressible} onChange={setIncompressible} label="Sous-catégorie incompressible 🔒" />
            {err && <p className="text-xs text-rose-600">{err}</p>}
            {okMsg && <p className="text-xs text-emerald-600">{okMsg}</p>}
            <button
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              onClick={submit}
              disabled={!subLabel.trim() || (mode === "nouvelle" ? !catLabel.trim() : !catId)}
            >
              Ajouter le couple
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
