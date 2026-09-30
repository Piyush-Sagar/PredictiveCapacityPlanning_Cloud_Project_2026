/**
 * Plain-language help for every dashboard page, used by the in-page
 * "How to read this page" panel and the /tutorial walkthrough.
 * Long-form version: docs/Frontend_Guide.md.
 */

export interface GuideItem {
  title: string;
  body: string;
}

export interface PageGuideContent {
  question: string;
  summary: string;
  items: GuideItem[];
  tryThis?: string[];
}

export const GLOSSARY: GuideItem[] = [
  {
    title: "P50",
    body: "The most likely forecast. Half the time actual demand is above it, half below.",
  },
  {
    title: "P90",
    body: "The safe forecast. Actual demand should stay below it 90% of the time. The planner buys servers for P90, so it is rarely caught short.",
  },
  { title: "Horizon", body: "How far ahead a forecast looks: 15, 30 or 60 minutes." },
  {
    title: "Unit",
    body: "One server or container. ECS task ≈ 8k viewers, EC2 instance ≈ 12.8k, origin ≈ 25.6k, transcoding worker ≈ 4k.",
  },
  {
    title: "SLA violation",
    body: "Minutes when demand exceeded what the servers could handle, so viewers would buffer. Lower is better.",
  },
  {
    title: "k",
    body: "Thousands of concurrent viewers. 631.2K means 631,200 people watching right now.",
  },
];

export const PAGE_GUIDES: Record<string, PageGuideContent> = {
  "/": {
    question: "Is everything healthy?",
    summary: "A one-glance status of demand, pending decisions, forecast trust, spend and every pipeline stage.",
    items: [
      { title: "Current demand", body: "Total viewers across all regions right now; the arrow compares with 1 hour ago." },
      { title: "Pending alerts", body: "Scaling decisions waiting for a human. Non-zero means go to Alerts." },
      { title: "Avg. model confidence", body: "How trustworthy the forecasts are (0–100%). Above ~75% is fine." },
      { title: "7-day spend", body: "Server + model cost over the last week, with buffering minutes underneath." },
      {
        title: "Live pipeline · simulated AWS",
        body: "One box per stage of the AWS architecture: the AWS service → what replaces it locally. A green dot means the stage is working.",
      },
    ],
    tryThis: ["Check that all 8 pipeline boxes have green dots."],
  },
  "/forecast": {
    question: "How many viewers are coming?",
    summary: "Each region's viewer count and the model's prediction of what happens next.",
    items: [
      { title: "Region cards", body: "Viewers right now per region, with a mini chart of the last 6 hours." },
      { title: "Orange line — Actual", body: "What really happened. It stops at the dashed “Now” line." },
      { title: "Teal line — P50", body: "What the model predicted. Good when it stays close to orange." },
      { title: "Blue band top — P90", body: "The safe upper estimate. Orange should almost always stay under it." },
      { title: "Right of “Now”", body: "The future: only the forecast exists there." },
      {
        title: "15m / 30m / 60m",
        body: "How far ahead to look. Longer horizons give a wider band because the model is less sure about the far future.",
      },
    ],
    tryThis: ["Switch between 15m and 60m and watch the band widen.", "Pick another region from the dropdown."],
  },
  "/capacity": {
    question: "How many servers do we need?",
    summary: "Forecasts become server counts here: current vs required for every region and server type.",
    items: [
      {
        title: "Bar chart",
        body: "Purple = servers running now, blue = servers needed. Purple taller means wasting money; blue taller means risk of buffering.",
      },
      { title: "Current / Required", body: "Servers now vs servers the P90 forecast needs (+20% safety margin)." },
      {
        title: "Guardrails",
        body: "“Hysteresis on” = deliberately not removing servers yet (it waits until demand stays low, to avoid flip-flopping). “Cooldown” = it scaled down recently and must wait.",
      },
      {
        title: "Decision",
        body: "Auto-execute = small change, done automatically. Needs approval = big change, sent to Alerts. Recommend = suggestion only.",
      },
      {
        title: "Scaling decision audit",
        body: "Every change actually made. “AWS desired” is what the simulated AWS ECS service now reports, which proves the change went through.",
      },
    ],
    tryThis: ["Click any row to see the formula with real numbers."],
  },
  "/confidence": {
    question: "Can we trust the forecasts?",
    summary: "When a model said “90% sure demand stays below X”, was it really below X 90% of the time?",
    items: [
      {
        title: "Model cards",
        body: "Score 0–100 and status. Nominal = fine; Degraded = drifting; Fallback = no longer trusted, the planner switched to the simple backup model.",
      },
      {
        title: "P90 calibration chart",
        body: "The dashed line is the 90% target. Near it is good. Far below = over-confident (dangerous). Far above = too cautious (wastes money).",
      },
      { title: "Snapshot table", body: "All models and horizons; “Region” is where that model does worst." },
    ],
  },
  "/alerts": {
    question: "What needs a human decision?",
    summary: "Big or risky scaling actions wait here for approval. Approving really changes the server count in (simulated) AWS.",
    items: [
      { title: "Scale … to N units (warning)", body: "A big capacity change. Approve applies it and shows the new ECS count." },
      { title: "… exceeds budget (critical)", body: "The needed servers would cross the daily budget; approve up to the cap." },
      { title: "SLA risk (critical)", body: "Demand is higher than current servers right now." },
      { title: "Predicted demand peak (info)", body: "A big rise is coming within the hour, often a scheduled match or release." },
      { title: "… falling back (critical)", body: "Forecast confidence dropped, so the planner switched to the backup model." },
      { title: "Reject", body: "Declines the change and stops re-proposing it for 30 simulated minutes." },
    ],
    tryThis: ["Speed up the clock (AWS Accounts page) to reach the 7–10 PM peak, then approve a warning."],
  },
  "/cost-sla": {
    question: "What does it cost, and are viewers happy?",
    summary: "Spend, cost predictions, buffering minutes, and the main result: predicting beats reacting.",
    items: [
      {
        title: "Cost forecast",
        body: "Next hour = cost range from the P50 and P90 demand forecasts. Month-end = projected bill. Chart: solid = past daily cost, dashed + band = predicted cost.",
      },
      { title: "Cost trend", body: "Daily spend. The last day is today, still in progress, so it looks lower." },
      { title: "SLA violations", body: "Buffering minutes per day. Zero is ideal." },
      {
        title: "Scaling policy comparison",
        body: "The same week replayed with each strategy. Static = fixed plan. Reactive = add servers at 70% CPU (the usual way). Predictive = this project. Lower bars are better; “vs. reactive” is the saving.",
      },
      { title: "Oscillations", body: "Times it scaled up and then quickly down. Fewer means more stable." },
    ],
  },
  "/benchmarking": {
    question: "Which forecasting model is best?",
    summary: "Seven models tested on the same held-out week. The system picks the best one per horizon automatically.",
    items: [
      {
        title: "Foundation vs baseline",
        body: "Chronos, TimesFM, Moirai and TTM are large pre-trained AI models; here they are SIMULATED. Seasonal Naive, XGBoost and LSTM are real models trained on the data.",
      },
      { title: "MAE / RMSE", body: "Average forecast error in thousands of viewers. Lower is better." },
      { title: "MASE", body: "Below 1 means better than the simple “same as yesterday” model." },
      { title: "P90 cov.", body: "How often reality stayed under P90. The target is about 90%." },
      { title: "Latency / Cost / Memory", body: "How expensive the model is to run." },
      { title: "Efficiency frontier", body: "Error vs speed. Bottom-left is best." },
      { title: "“selected” tag", body: "The model the live system uses for this horizon." },
    ],
  },
  "/accounts": {
    question: "Which AWS account are we managing?",
    summary: "Connect (simulated) AWS accounts, tune the scaling rules, and control the simulation clock.",
    items: [
      {
        title: "Connect an AWS account",
        body: "Opens a fake AWS CloudFormation page that creates a permission role; the dashboard then logs in with that role. This is how SaaS tools securely connect to AWS.",
      },
      { title: "Linked accounts", body: "Connected accounts. “Make active” switches the whole dashboard to that account." },
      {
        title: "Scaling policy",
        body: "Safety margin, wait times, budget, and when to ask for approval. Decision mode: Auto / Approve all / Recommend only. Admin only.",
      },
      {
        title: "Simulation clock",
        body: "Simulated time moves 5 minutes per tick. Admins can pause, step, or set e.g. 2 s/tick to fast-forward.",
      },
      { title: "SNS deliveries", body: "Notifications “sent” for warning and critical alerts via simulated AWS SNS." },
    ],
  },
};

export interface TourStep {
  title: string;
  href: string;
  action: string;
  lookFor: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Connect an AWS account",
    href: "/accounts",
    action: "Pick “StreamCo Production” → Launch quick-create stack → tick the box → Create stack.",
    lookFor: "You come back with the account connected; the top bar shows streamco-prod.",
  },
  {
    title: "Check the pipeline is healthy",
    href: "/",
    action: "Look at the “Live pipeline · simulated AWS” card.",
    lookFor: "All 8 stages have a green dot.",
  },
  {
    title: "Read a forecast",
    href: "/forecast",
    action: "Choose US East, then switch between 15m and 60m.",
    lookFor: "Orange (actual) tracks teal (forecast) and stays under the blue P90 band, and the band widens at 60m.",
  },
  {
    title: "Fast-forward time",
    href: "/accounts",
    action: "In “Simulation clock”, type 2 in the speed box and click Set speed (admin only).",
    lookFor: "The clock in the top bar moves about 5× faster, towards the evening peak.",
  },
  {
    title: "See forecasts turn into servers",
    href: "/capacity",
    action: "Click any row in the recommendations table.",
    lookFor: "The formula with real numbers, and new rows appearing in the Scaling decision audit.",
  },
  {
    title: "Approve a big change",
    href: "/alerts",
    action: "When a “Scale … to N units” warning appears, click Approve.",
    lookFor: "A toast shows units from → to and the new ECS desired count; the audit shows “approved by you”.",
  },
  {
    title: "Check forecast trust",
    href: "/confidence",
    action: "Compare each model's bar with the dashed 90% line.",
    lookFor: "Most models Nominal; bars close to the target.",
  },
  {
    title: "See cost and the main result",
    href: "/cost-sla",
    action: "Read the Cost forecast card, then the Scaling policy comparison.",
    lookFor: "Predictive P90 costs about 13% less than Reactive with fewer SLA minutes.",
  },
  {
    title: "Compare the models",
    href: "/benchmarking",
    action: "Switch between 15m, 30m and 60m.",
    lookFor: "Which model is “selected”, and why (lowest error with good P90 coverage).",
  },
];
