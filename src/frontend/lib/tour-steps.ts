/** Steps of the interactive dashboard tour (components/tour/tour-provider.tsx). */

export interface TourStepDef {
  /** Page the step lives on; the tour navigates there automatically. */
  path: string;
  /** `data-tour` value of the element to spotlight; omit for a centred card. */
  target?: string;
  title: string;
  body: string;
  /** "Your turn" step: clicking an element matching this selector inside the target advances. */
  advanceOn?: string;
  actionHint?: string;
  liveOnly?: boolean;
}

export const TOUR: TourStepDef[] = [
  {
    path: "/",
    title: "Welcome to the Capacity Planner 👋",
    body: "This dashboard runs a video-streaming platform's servers. It predicts how many viewers are coming in the next 15–60 minutes and adds servers before they arrive, so video doesn't buffer and money isn't wasted. AWS and the viewer data are simulated. This tour takes about 3 minutes; use Next, or the → and ← keys.",
  },
  {
    path: "/",
    target: "sidebar",
    title: "Pages",
    body: "Each page answers one question: How many viewers are coming (Forecast)? How many servers do we need (Capacity)? Can we trust the forecast (Confidence)? What needs a human (Alerts)? What does it cost (Cost & SLA)? Which model is best (Benchmarking)?",
  },
  {
    path: "/",
    target: "header-context",
    title: "Simulated time and the AWS account",
    body: "The clock is “now” in the simulated world. It moves 5 minutes every few seconds, so you can watch a whole evening quickly. Next to it is the AWS account being managed; every page shows data for this account only.",
    liveOnly: true,
  },
  {
    path: "/accounts",
    target: "accounts-connect",
    title: "Connect an AWS account",
    body: "If nothing is connected yet, pick “StreamCo Production” and click Launch quick-create stack. A fake AWS CloudFormation page creates a permission role; tick the box and click Create stack, and you come back connected. Already connected? Just press Next.",
    liveOnly: true,
  },
  {
    path: "/",
    target: "overview-kpis",
    title: "The four numbers that matter",
    body: "Viewers watching right now, decisions waiting for you, how trustworthy the forecasts are, and what the last 7 days cost (with minutes of buffering underneath).",
  },
  {
    path: "/",
    target: "overview-pipeline",
    title: "Is every part of the system working?",
    body: "One box per stage of the AWS architecture: the real AWS service → what replaces it locally. A green dot means the stage is working; red means that part is failing.",
    liveOnly: true,
  },
  {
    path: "/forecast",
    target: "forecast-regions",
    title: "Viewers per region",
    body: "Current concurrent viewers in each of the five regions, with the last 6 hours as a mini chart. “631K” means 631,000 people watching.",
  },
  {
    path: "/forecast",
    target: "forecast-chart",
    title: "Reading the forecast",
    body: "Orange = what actually happened. Teal = what the model predicted (P50, the most likely value). The top of the blue band = P90, a safe upper estimate that reality should stay under 90% of the time. Right of the dashed “Now” line is the future.",
  },
  {
    path: "/forecast",
    target: "forecast-horizon",
    title: "Your turn: look further ahead",
    body: "Click 60m. The band gets wider, because predicting an hour ahead is less certain than 15 minutes ahead.",
    advanceOn: "button",
    actionHint: "Click 60m to continue",
  },
  {
    path: "/capacity",
    target: "capacity-chart",
    title: "Servers now vs servers needed",
    body: "Purple = servers running now; blue = servers the forecast says we need. Purple taller means we're paying for idle servers. Blue taller means viewers are at risk of buffering.",
  },
  {
    path: "/capacity",
    target: "capacity-table",
    title: "Your turn: see the math",
    body: "Each row is one region × server type. “Decision” says whether the change runs automatically (small), needs approval (big), or is just a suggestion. Click any row to see exactly how the server count was calculated.",
    advanceOn: "tr[role=button]",
    actionHint: "Click any row to continue",
  },
  {
    path: "/capacity",
    target: "capacity-audit",
    title: "Proof it actually happened",
    body: "Every change the system made: from → to units, whether it was automatic or approved by a person, and “AWS desired”, the count the simulated AWS ECS service now reports.",
    liveOnly: true,
  },
  {
    path: "/alerts",
    target: "alerts-list",
    title: "Decisions that need you",
    body: "Big scale changes, budget overruns, SLA risk and upcoming peaks land here. Approve really changes the server count in (simulated) AWS; Reject pauses that proposal for 30 simulated minutes. Try one if any are pending.",
  },
  {
    path: "/confidence",
    target: "confidence-chart",
    title: "Can we trust the forecast?",
    body: "When a model said “90% sure demand stays below X”, was it right 90% of the time? Bars near the dashed 90% line are good. Far below means the model is over-confident, so the system switches to a safer backup model automatically.",
  },
  {
    path: "/cost-sla",
    target: "cost-forecast",
    title: "What will it cost?",
    body: "Next hour's cost range from the P50 and P90 demand forecasts, spend so far today, and projections for the next 14 days and month-end. Solid line = past, dashed + band = predicted.",
    liveOnly: true,
  },
  {
    path: "/cost-sla",
    target: "cost-policies",
    title: "The main result: predicting beats reacting",
    body: "The same week replayed with each strategy. “Reactive” is how most teams scale (add servers when CPU hits 70%). Predictive P90 costs about 13% less with fewer buffering minutes. Lower bars are better in both charts.",
    liveOnly: true,
  },
  {
    path: "/benchmarking",
    target: "bench-table",
    title: "Which forecasting model wins?",
    body: "Seven models tested on the same week. Lower MAE/sMAPE = more accurate; P90 cov. near 90% = well calibrated; latency and cost = how expensive to run. “selected” marks the model the live system uses. Foundation models are simulated in this demo.",
  },
  {
    path: "/accounts",
    target: "accounts-clock",
    title: "Speed things up",
    body: "Admins can pause the simulation, step 5 minutes, or set e.g. 2 seconds per step to fast-forward into the evening peak (7–10 PM), where the interesting alerts appear.",
    liveOnly: true,
  },
  {
    path: "/",
    title: "You're all set 🎉",
    body: "Every page has a “How to read this page” button under its title, and the Tutorial page (sidebar) has the glossary and a checklist. Restart this tour any time from the 🎓 button in the top bar.",
  },
];

// ---------------------------------------------------------------- section tours

export interface TourDef {
  id: string;
  title: string;
  description: string;
  /** Page whose header shows a "Take the … tour" button. */
  section?: string;
  steps: TourStepDef[];
}

const s = (path: string, target: string | undefined, title: string, body: string, extra: Partial<TourStepDef> = {}): TourStepDef => ({
  path,
  target,
  title,
  body,
  ...extra,
});

export const TOURS: TourDef[] = [
  {
    id: "full",
    title: "Full dashboard tour",
    description: "Every section in one walkthrough (about 3 minutes).",
    steps: TOUR,
  },
  {
    id: "overview",
    title: "Overview tour",
    description: "Read the health of the whole system at a glance.",
    section: "/",
    steps: [
      s("/", "overview-kpis", "Four headline numbers", "Current viewers (arrow = change vs 1 hour ago), decisions waiting for you, average forecast trust, and last-7-day spend with buffering minutes underneath."),
      s("/", "overview-pipeline", "Pipeline health", "Each box is one stage of the AWS reference architecture: the AWS service → the local stand-in → what it did recently. Green = working, red = failing. If “Guarded scaling” turned red, servers can't be changed.", { liveOnly: true }),
      s("/", "overview-loop", "The decision loop", "Forecast → capacity translation → guardrails → scale decision → observe → evaluate → retrain. Hover a numbered circle for what that stage does."),
      s("/", "header-context", "Time and account", "Everything is for this simulated time and this AWS account. Switch accounts from the dropdown.", { liveOnly: true }),
    ],
  },
  {
    id: "forecast",
    title: "Forecast tour",
    description: "How to read predictions, confidence bands and horizons.",
    section: "/forecast",
    steps: [
      s("/forecast", "forecast-regions", "Five regions at a glance", "Each card is one region's current concurrent viewers and its last 6 hours. Regions peak at different UTC times because prime time is local."),
      s("/forecast", "forecast-chart", "Actual vs predicted", "Orange = actual viewers; teal = P50 (most likely); top of the blue band = P90 (safe upper estimate). Where orange rises above the band, the model was surprised, usually an unscheduled viral spike."),
      s("/forecast", "forecast-region-select", "Change region", "Use this dropdown (after the tour) to switch the chart to another region. Each has its own daily shape and size, because prime time is local."),
      s("/forecast", "forecast-horizon", "Your turn: change horizon", "Click 30m or 60m. The model and the band width change. Different horizons can use different models (see Benchmarking).", { advanceOn: "button", actionHint: "Click 30m or 60m to continue" }),
      s("/forecast", "forecast-table", "The numbers behind the chart", "Rows around “now”: Observed rows have an actual value to compare with; Forecast rows are the future. P90 minus P50 is how uncertain the model is."),
    ],
  },
  {
    id: "capacity",
    title: "Capacity tour",
    description: "From viewers to servers: formula, guardrails and decisions.",
    section: "/capacity",
    steps: [
      s("/capacity", "capacity-kpis", "Totals", "Servers needed vs running now, how many pools need your approval, and the daily cost at the required size. “vs. provisioned” shows whether we're about to scale up or down."),
      s("/capacity", "capacity-chart", "Where the gap is", "Per region: purple = running, blue = needed. A big purple-over-blue gap is money being wasted; the planner removes servers slowly on purpose (hysteresis) to avoid flip-flopping."),
      s("/capacity", "capacity-table", "Your turn: open a pool", "Each row is region × server type. Click one to see: P90 demand ÷ viewers-per-server × (1 + safety margin) = servers needed, then min/max, budget and decision.", { advanceOn: "tr[role=button]", actionHint: "Click any row to continue" }),
      s("/capacity", "capacity-table", "Guardrails and decisions", "Hysteresis on = holding servers until demand stays low. Cooldown = waiting after a recent scale-in. Auto-execute = small change, applied. Needs approval = big change, sent to Alerts. Recommend = suggestion only."),
      s("/capacity", "capacity-audit", "What actually changed", "The audit trail: each executed change, who or what triggered it, the model used, and the ECS desired count the simulated AWS API reported back.", { liveOnly: true }),
    ],
  },
  {
    id: "alerts",
    title: "Alerts tour",
    description: "Approve or reject the planner's big decisions.",
    section: "/alerts",
    steps: [
      s("/alerts", "alerts-kpis", "What's waiting", "Pending decisions, how many are critical, and how many were resolved (approved or auto-executed)."),
      s("/alerts", "alerts-tabs", "Your turn: filter by status", "Pending needs you; Approved/Rejected are history; Auto-executed are medium changes the planner applied itself. Click a tab.", { advanceOn: "button", actionHint: "Click any tab to continue" }),
      s("/alerts", "alerts-filters", "Narrow it down", "Filter by region or severity (info, warning, critical)."),
      s("/alerts", "alerts-list", "Approve or reject", "Approve on a scale alert changes the server count in the simulated AWS account (the toast shows from → to). Reject snoozes that proposal for 30 simulated minutes. SLA-risk and peak alerts are just acknowledged."),
    ],
  },
  {
    id: "confidence",
    title: "Confidence tour",
    description: "Is each model's uncertainty honest?",
    section: "/confidence",
    steps: [
      s("/confidence", "confidence-gauges", "One card per model", "Score 0–100 and status: Nominal (fine), Degraded (drifting), Fallback (no longer trusted, so the planner uses the seasonal-naive backup)."),
      s("/confidence", "confidence-horizon", "Your turn: pick a horizon", "Confidence is measured separately for 15, 30 and 60 minutes ahead. Click one.", { advanceOn: "button", actionHint: "Click 15m, 30m or 60m" }),
      s("/confidence", "confidence-chart", "Calibration", "Each bar is how often reality stayed under the model's P90. The target is the dashed 90% line. Below it = over-confident (risk of buffering). Above it = too cautious (extra cost)."),
      s("/confidence", "confidence-table", "All models × horizons", "Target vs actual coverage and the gap (calibration error). “Region” is where that model currently does worst."),
    ],
  },
  {
    id: "cost",
    title: "Cost & SLA tour",
    description: "Spend, cost predictions and the policy comparison.",
    section: "/cost-sla",
    steps: [
      s("/cost-sla", "cost-kpis", "The bill and the service quality", "Server cost, model-hosting cost, buffering minutes and scaling oscillations for the selected period."),
      s("/cost-sla", "cost-range", "Your turn: change the period", "Switch between 7, 14 and 30 days.", { advanceOn: "button", actionHint: "Click 7d, 14d or 30d" }),
      s("/cost-sla", "cost-forecast", "Cost prediction", "Next hour: cost range from the P50 and P90 demand forecasts. Next 14 days and month-end: a Cost Explorer-style forecast with an 80% range (the shaded band).", { liveOnly: true }),
      s("/cost-sla", "cost-trend", "Daily spend", "Infrastructure vs model inference per day. Today is still accruing, so the last point is lower."),
      s("/cost-sla", "cost-sla-chart", "Buffering minutes", "Minutes per day when demand exceeded what the servers could handle. The goal is zero."),
      s("/cost-sla", "cost-policies", "Why predictive scaling", "The same test week under each strategy. Predictive P90 with the selected model beats Reactive on both cost (~13% cheaper) and buffering minutes. P50 is cheaper but buffers more.", { liveOnly: true }),
      s("/cost-sla", "cost-events", "Event log", "Per day and region: overloads, under-used servers, oscillations and SLA minutes. Export as CSV from the button."),
    ],
  },
  {
    id: "benchmarking",
    title: "Benchmarking tour",
    description: "Compare the seven forecasting models.",
    section: "/benchmarking",
    steps: [
      s("/benchmarking", "bench-banner", "Real vs simulated", "The four foundation models are simulated from published profiles; the three baselines are real models trained on this data. Keep that in mind when comparing.", { liveOnly: true }),
      s("/benchmarking", "bench-horizon", "Your turn: pick a horizon", "Rankings change with how far ahead you forecast. Click 30m or 60m.", { advanceOn: "button", actionHint: "Click a horizon tab" }),
      s("/benchmarking", "bench-errors", "Accuracy", "MAE and RMSE in thousands of viewers. Shorter bars are more accurate."),
      s("/benchmarking", "bench-frontier", "Accuracy vs speed", "Bottom-left = accurate and fast. Foundation models sit to the right because they need GPUs and take longer per forecast."),
      s("/benchmarking", "bench-table", "Full scorecard", "sMAPE (% error), MASE (<1 beats “same as yesterday”), P90 coverage (target ~90%), latency, cost per 1,000 forecasts, memory, and accuracy during flash crowds. “selected” = used live."),
    ],
  },
  {
    id: "accounts",
    title: "AWS Accounts tour",
    description: "Connect accounts, tune policy, control the simulation.",
    section: "/accounts",
    steps: [
      s("/accounts", "accounts-connect", "Connecting an account", "Launch quick-create opens a simulated AWS CloudFormation page. It creates a role that trusts this platform with a unique ExternalId; the backend then assumes it. No real AWS is touched.", { liveOnly: true }),
      s("/accounts", "accounts-linked", "Linked accounts", "Status, regions and the role in use. “Make active” switches every page to that account. Admins can remove accounts.", { liveOnly: true }),
      s("/accounts", "accounts-policy", "Scaling policy", "The rules the planner obeys: safety margin, hysteresis, cooldown, budget, and when to auto-execute vs ask. Try Decision mode = Approve all to see every change land in Alerts (admin only).", { liveOnly: true }),
      s("/accounts", "accounts-clock", "Simulation clock", "Pause, step 5 minutes, or change speed. 2 s/tick fast-forwards to the evening peak.", { liveOnly: true }),
      s("/accounts", "accounts-sns", "Notifications", "Warning and critical alerts are published to a simulated SNS topic; the latest deliveries appear here.", { liveOnly: true }),
    ],
  },
];

export function tourById(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

export function tourForSection(path: string): TourDef | undefined {
  return TOURS.find((t) => t.section === path);
}
