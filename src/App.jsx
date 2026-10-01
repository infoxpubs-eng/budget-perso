import React, { useEffect, useMemo, useState } from "react";
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
  CATS,
  MONTHS,
  fmt,
  monthLabel,
  simulate,
  freqInMonth,
  expensesByCat,
} from "./lib/budget.js";

/* ============================== Données initiales ============================== */

const DEFAULT_STATE = {
  soldeDepart: 1500,
  expenses: [
    { id: uuid(), label: "Loyer", amount: 850, day: 3, cat: "domestiques", freq: "mensuelle" },
    { id: uuid(), label: "Électricité / gaz", amount: 95, day: 8, cat: "domestiques", freq: "mensuelle" },
    { id: uuid(), label: "Courses (début de mois)", amount: 220, day: 5, cat: "habituelles", freq: "mensuelle" },
    { id: uuid(), label: "Courses (mi-mois)", amount: 220, day: 20, cat: "habituelles", freq: "mensuelle" },
    { id: uuid(), label: "Internet + mobile", amount: 45, day: 12, cat: "habituelles", freq: "mensuelle" },
    { id: uuid(), label: "Salle de sport", amount: 30, day: 1, cat: "sports", freq: "mensuelle" },
    { id: uuid(), label: "Streaming & abonnements", amount: 25, day: 15, cat: "loisirs", freq: "mensuelle" },
    { id: uuid(), label: "Sorties / restaurants", amount: 80, day: 25, cat: "loisirs", freq: "mensuelle" },
    { id: uuid(), label: "Vacances d'été", amount: 1200, day: 2, cat: "voyages", freq: "annuelle", month: 7 },
  ],
  incomes: [
    { id: uuid(), label: "Salaire", amount: 2500, day: 27, freq: "mensuelle" },
    { id: uuid(), label: "Aide / allocations", amount: 180, day: 5, freq: "mensuelle" },
  ],
  budgets: { domestiques: 1000, habituelles: 500, sports: 50, loisirs: 120, voyages: 100 },
};

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
              <span className="text-slate-600">{e.label}</span>
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

  // Persistance locale (si disponible)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("budget-perso-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setState({ ...DEFAULT_STATE, ...parsed });
      }
    } catch (e) {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("budget-perso-v1", JSON.stringify(state));
    } catch (e) {}
  }, [state, loaded]);

  const start = useMemo(() => ({ y: now.getFullYear(), m: now.getMonth() }), []);
  const sims = useMemo(() => simulate(state, start.y, start.m), [state, start]);
  const sim = sims[Math.min(monthIdx, 11)];

  const setSolde = (n) => setState((s) => ({ ...s, soldeDepart: n }));

  const addExpense = (e) => setState((s) => ({ ...s, expenses: [...s.expenses, e] }));
  const delExpense = (id) => setState((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== id) }));
  const addIncome = (i) => setState((s) => ({ ...s, incomes: [...s.incomes, i] }));
  const delIncome = (id) => setState((s) => ({ ...s, incomes: s.incomes.filter((x) => x.id !== id) }));
  const setBudget = (cat, n) => setState((s) => ({ ...s, budgets: { ...s.budgets, [cat]: n } }));

  // Dépenses planifiées du mois par catégorie
  const byCat = useMemo(() => expensesByCat(state.expenses, sim.m), [state.expenses, sim.m]);

  const dailyFlow = sim.daily
    .filter((d) => d.day > 0)
    .map((d) => ({
      day: d.day,
      flux: d.events.reduce((a, e) => a + e.amount, 0),
    }));

  const yearData = sims.map((s) => ({ label: s.label, solde: s.end }));

  const tabs = [
    { id: "apercu", label: "Aperçu" },
    { id: "depenses", label: "Dépenses récurrentes" },
    { id: "revenus", label: "Revenus" },
    { id: "budget", label: "Budget par catégorie" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* En-tête */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">💰 Budget prévisionnel</h1>
            <p className="text-sm text-slate-500">
              Solde de départ : le mois 1 commence en {monthLabel(start.y, start.m)}. Les mois suivants reprennent le solde prévu.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-44">
              <Field label="Solde de départ (€)">
                <NumInput value={state.soldeDepart} onChange={setSolde} />
              </Field>
            </div>
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
            >
              ←
            </button>
            <select className={inputCls + " w-44"} value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))}>
              {sims.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
              onClick={() => setMonthIdx((i) => Math.min(11, i + 1))}
              disabled={monthIdx === 11}
            >
              →
            </button>
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
              <p className="mb-3 text-xs text-slate-500">Survolez le graphique pour voir les opérations débitées / créditées chaque jour.</p>
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
                                  <span>{e.label}</span>
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
            <Card className="lg:col-span-2">
              <h2 className="mb-3 font-semibold">Dépenses récurrentes ({state.expenses.length})</h2>
              <div className="space-y-2">
                {state.expenses.map((e) => {
                  const cat = CATS.find((c) => c.id === e.cat);
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{e.label}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>Le {e.day} du mois</span>
                          <span>·</span>
                          {e.freq === "annuelle" ? <span>{MONTHS[(e.month ?? 1) - 1]}</span> : <span>Chaque mois</span>}
                          <Badge color={cat ? cat.color : "#94a3b8"}>{cat ? cat.label : "?"}</Badge>
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
                    Aucune dépense enregistrée.
                  </div>
                )}
              </div>
            </Card>

            <ExpenseForm onAdd={addExpense} />
          </div>
        )}

        {/* ------------------------------ REVENUS ------------------------------ */}
        {tab === "revenus" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-3 font-semibold">Entrées d'argent récurrentes ({state.incomes.length})</h2>
              <div className="space-y-2">
                {state.incomes.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{i.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Le {i.day} du mois · {i.freq === "annuelle" ? MONTHS[(i.month ?? 1) - 1] : "Chaque mois"}
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

            <IncomeForm onAdd={addIncome} />
          </div>
        )}

        {/* ------------------------------ BUDGET ------------------------------ */}
        {tab === "budget" && (
          <div className="space-y-6">
            <Card>
              <h2 className="mb-1 font-semibold">Budget prévisionnel — {sim.label}</h2>
              <p className="mb-4 text-xs text-slate-500">
                Comparez l'enveloppe que vous souhaitez consacrer à chaque type de dépenses avec le total réellement planifié ce mois-ci.
              </p>
              <div className="space-y-4">
                {CATS.map((c) => {
                  const planned = byCat[c.id] ?? 0;
                  const budget = state.budgets[c.id] ?? 0;
                  const pct = budget > 0 ? Math.min(100, (planned / budget) * 100) : planned > 0 ? 100 : 0;
                  const over = planned > budget;
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
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">Répartition des dépenses du mois par catégorie</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={CATS.map((c) => ({ label: c.label, total: byCat[c.id] ?? 0, color: c.color }))}
                    margin={{ top: 10, right: 10, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => v + "€"} width={56} />
                    <Tooltip content={<SimpleTooltip />} />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {CATS.map((c) => (
                        <Cell key={c.id} fill={c.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== Formulaires ============================== */

function ExpenseForm({ onAdd }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(1);
  const [cat, setCat] = useState("domestiques");
  const [freq, setFreq] = useState("mensuelle");
  const [month, setMonth] = useState(1);

  const submit = () => {
    if (!label.trim() || amount <= 0) return;
    onAdd({
      id: uuid(),
      label: label.trim(),
      amount,
      day: Math.min(31, Math.max(1, day)),
      cat,
      freq,
      month: freq === "annuelle" ? month : undefined,
    });
    setLabel("");
    setAmount(0);
    setDay(1);
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Ajouter une dépense</h2>
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
        <Field label="Type">
          <select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
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

function IncomeForm({ onAdd }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(1);
  const [freq, setFreq] = useState("mensuelle");
  const [month, setMonth] = useState(1);

  const submit = () => {
    if (!label.trim() || amount <= 0) return;
    onAdd({
      id: uuid(),
      label: label.trim(),
      amount,
      day: Math.min(31, Math.max(1, day)),
      freq,
      month: freq === "annuelle" ? month : undefined,
    });
    setLabel("");
    setAmount(0);
    setDay(1);
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
