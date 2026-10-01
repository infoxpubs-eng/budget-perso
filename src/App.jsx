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
  fmt,
  monthLabel,
  salaryPayDay,
  simulate,
  migrateState,
  monthlyExpenses,
} from "./lib/budget.js";
import { TAXONOMIE, depenseCats, revenuOptions, taxCat, taxSub, labelOf, envelopeOf } from "./lib/taxonomie.js";
import { parseCsv, rowsToEntries } from "./lib/import-csv.js";

/* ============================== Données initiales ============================== */

const now0 = new Date();

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
  extras: [
    { id: uuid(), label: "Réparation voiture", amount: 350, day: 18, y: now0.getFullYear(), m: now0.getMonth(), cat: "auto-moto", sub: "entretien" },
  ],
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
      <div className="mt-1 font-bold text-slate-900">{fmt(payload[0].value)}</div>
    </div>
  );
}

/* ============================== App ============================== */

export default function App() {
  const now = new Date();
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("apercu");
  const [monthIdx, setMonthIdx] = useState(0);
  const fileRef = useRef(null);
  const csvRef = useRef(null);

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
  const sims = useMemo(() => simulate(state, start.y, start.m), [state, start]);
  const sim = sims[Math.min(monthIdx, 11)];

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
        setMonthIdx(0);
      } catch (e) {
        alert("Fichier invalide ou illisible.");
      }
    };
    reader.readAsText(file);
  };

  // ----- Import d'un relevé bancaire CSV (débit = dépense, crédit = revenu unique) -----
  const importCsvFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = parseCsv(String(reader.result));
      } catch (e) {
        alert("Fichier CSV non reconnu : " + e.message);
        return;
      }
      if (parsed.rows.length === 0) {
        alert("Aucune ligne exploitable trouvée dans ce fichier." + (parsed.categoriesInconnues.length ? "\nCatégories inconnues : " + parsed.categoriesInconnues.join(", ") : ""));
        return;
      }
      const { extras, incomes, depensesTotal, revenusTotal } = rowsToEntries(parsed.rows);
      const msg =
        "Import du relevé :\n" +
        extras.length + " dépense(s), total " + fmt(depensesTotal) + "\n" +
        incomes.length + " revenu(s) unique(s), total " + fmt(revenusTotal) + "\n" +
        parsed.ignored + " ligne(s) ignorée(s)" +
        (parsed.categoriesInconnues.length ? "\nCatégories inconnues : " + parsed.categoriesInconnues.join(", ") : "") +
        "\n\nLes dépenses deviennent des dépenses exceptionnelles à leur date réelle ; les revenus des entrées uniques. Continuer ?";
      if (window.confirm(msg)) {
        setState((s) => ({
          ...s,
          extras: [...s.extras, ...extras],
          incomes: [...s.incomes, ...incomes],
        }));
      }
    };
    reader.readAsText(file);
  };

  const resetData = () => {
    if (window.confirm("Effacer toutes vos données et revenir à l'exemple de démonstration ?")) {
      try { localStorage.removeItem("budget-perso-v2"); } catch (e) {}
      setState(DEFAULT_STATE);
      setMonthIdx(0);
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

  const yearData = sims.map((s) => ({ label: s.label, solde: s.end }));

  const tabs = [
    { id: "apercu", label: "Aperçu" },
    { id: "depenses", label: "Dépenses" },
    { id: "revenus", label: "Revenus" },
    { id: "budget", label: "Budget par catégorie" },
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
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Field label="Solde de départ (€)">
                <NumInput value={state.soldeDepart} onChange={setSolde} />
              </Field>
            </div>
            <button className={btnCls} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} disabled={monthIdx === 0}>
              ←
            </button>
            <select className={inputCls + " w-44"} value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))}>
              {sims.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
            <button className={btnCls} onClick={() => setMonthIdx((i) => Math.min(11, i + 1))} disabled={monthIdx === 11}>
              →
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Solde en début de mois" value={fmt(sim.start)} />
              <Kpi label="Revenus du mois" value={"+ " + fmt(sim.totalIn)} tone="good" />
              <Kpi label="Dépenses du mois" value={"− " + fmt(sim.totalOut)} tone="bad" />
              <Kpi
                label="Solde fin de mois"
                value={fmt(sim.end)}
                tone={sim.end >= 0 ? "accent" : "bad"}
                hint={sim.end >= sim.start ? "Évolution : + " + fmt(sim.end - sim.start) : "Évolution : − " + fmt(sim.start - sim.end)}
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
                                  <span>{e.label}{e.inc ? " 🔒" : ""}</span>
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
                  Enchaînement des mois à partir de {monthLabel(start.y, start.m)} avec le solde de départ de {fmt(state.soldeDepart)}.
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
                <h2 className="mb-3 font-semibold">Dépenses récurrentes ({state.expenses.length})</h2>
                <div className="space-y-2">
                  {state.expenses.map((e) => {
                    const c = taxCat(e.cat);
                    const s = taxSub(e.cat, e.sub);
                    const env = ENVELOPPES.find((x) => x.id === envelopeOf(e.cat, e.sub));
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{e.label}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>Le {e.day} du mois</span>
                            <span>·</span>
                            {e.freq === "annuelle" ? <span>{MONTHS[(e.month ?? 1) - 1]}</span> : <span>Chaque mois</span>}
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
                    const c = taxCat(x.cat);
                    const s = taxSub(x.cat, x.sub);
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
              <ExpenseForm onAdd={addExpense} />
              <ExtraForm sims={sims} monthIdx={monthIdx} onAdd={addExtra} />
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
                        {i.cat && <Badge color="#10b981">{labelOf(i.cat, i.sub)}</Badge>}
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

            <IncomeForm sims={sims} monthIdx={monthIdx} onAdd={addIncome} />
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
                              {labelOf(d.cat, d.sub)} : <span className="font-medium text-slate-700">{fmt(d.amount)}</span>
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
      </div>
    </div>
  );
}

/* ============================== Formulaires ============================== */

function ExpenseForm({ onAdd }) {
  const DEPCATS = useMemo(() => depenseCats(), []);
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
    const first = DEPCATS.find((c) => c.id === id)?.subs[0]?.id ?? "";
    setSub(first);
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
            <select className={inputCls} value={sub} onChange={(e) => setSub(e.target.value)} disabled={subs.length === 0}>
              {subs.length === 0 && <option value="">—</option>}
              {subs.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
        </div>
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

function ExtraForm({ sims, monthIdx, onAdd }) {
  const DEPCATS = useMemo(() => depenseCats(), []);
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
    const first = DEPCATS.find((c) => c.id === id)?.subs[0]?.id ?? "";
    setSub(first);
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
            <select className={inputCls} value={sub} onChange={(e) => setSub(e.target.value)} disabled={subs.length === 0}>
              {subs.length === 0 && <option value="">—</option>}
              {subs.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
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

function IncomeForm({ sims, monthIdx, onAdd }) {
  const ROPTS = useMemo(() => revenuOptions(), []);
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
