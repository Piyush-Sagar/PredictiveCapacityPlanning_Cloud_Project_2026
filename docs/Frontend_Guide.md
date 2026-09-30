# Dashboard Guide: what you are looking at

This guide explains the Capacity Planner dashboard (http://localhost:3000)
in plain language, page by page and card by card.

> The same help is built into the dashboard. Open **Tutorial** in the sidebar
> (http://localhost:3000/tutorial) for a guided tour with progress tracking.
> Every page also has a **"How to read this page"** button under its title that
> explains each card. It opens automatically the first time you visit a page.

---

## 1. The idea in one minute

Imagine you run a video streaming service like Netflix or Hotstar, with viewers in 5 regions
(US East, US West, EU West, AP South, SA East).

- The number of people watching changes all day. It is low at 5 AM, peaks around 9 PM, and
  jumps during a big live match or a new episode release.
- To serve viewers you rent **servers** on AWS. Too few servers means the video buffers
  (an **SLA violation**, meaning you broke your promise of good service). Too many means
  you waste money.
- Most companies react *after* traffic rises. By the time new servers boot (about 10 minutes),
  viewers are already buffering.

**This project predicts demand 15, 30 and 60 minutes ahead, then adds servers *before* the
spike arrives.**

The loop that runs every 5 simulated minutes:

```
 1. Measure         how many viewers are watching right now (per region)
 2. Forecast        how many will watch in 15 / 30 / 60 min  (P50 and P90, see below)
 3. Translate       viewers → number of servers needed
 4. Guardrails      don't flip-flop, don't exceed budget, stay within min/max
 5. Act             small change → do it automatically
                    big change   → ask a human (Alerts page)
 6. Check           was the forecast right? if not, switch to a safer model
```

Everything runs locally. There is **no real AWS**: AWS is simulated, and the viewer data is
a generated replay of a realistic 2-day window. A "simulation clock" moves time forward
5 minutes every 10 real seconds, so you can watch a whole evening in a few minutes.

---

## 2. Five words you need

| Word | Meaning |
|---|---|
| **P50** | The "most likely" forecast. Half the time actual demand is above it, half below. |
| **P90** | The "safe" forecast. Actual demand should be **below** this 90% of the time. The planner buys servers for P90, not P50, so it is rarely caught short. |
| **Horizon** | How far ahead the forecast looks: 15, 30 or 60 minutes. |
| **Unit** | One server/container. Each type serves a fixed number of viewers: ECS task = 8k, EC2 instance = 12.8k, origin = 25.6k, transcoding worker = 4k. |
| **SLA violation** | Minutes when demand was higher than the servers could handle (viewers buffering). Lower is better. |

Numbers like **631.2K** mean 631,200 concurrent viewers. Charts use "k" for thousands.

---

## 3. The top bar (on every page)

| Element | What it shows |
|---|---|
| **Search box (⌘K)** | Jump to any page, region, or pending alert. |
| **● Sep 29, 21:35 UTC** | The **simulation clock**, which is "now" inside the demo world. Green dot means time is moving; amber means paused. |
| **streamco-prod · 1111-2222-3333** | Which (simulated) AWS account you are looking at. Every page shows data for this account only. Switch accounts here. |
| **🔔 bell** | Goes to Alerts. |
| **☀ icon** | Light/dark theme. |
| **Your name + role** | *Operator* can view and approve. *Admin* can also change policy and control the clock. Click to sign out. |

---

## 4. Page by page

### 4.1 Overview: "Is everything healthy?"

| Card | What it shows | How to read it |
|---|---|---|
| **Current demand** | Total viewers across all regions right now | The arrow shows the change vs 1 hour ago. Rising in the evening is normal. |
| **Pending alerts** | Decisions waiting for a human | If non-zero, go to Alerts. |
| **Avg. model confidence** | How trustworthy the forecasts are, 0–100% | Above ~75% is fine. |
| **7-day spend** | Server + model costs over the last week, and SLA minutes | Money spent vs service quality. |
| **Live pipeline · simulated AWS** | 8 boxes, one per stage of the AWS architecture diagram (`architecture/AWS_Architecture.png`) | Each box says *AWS service → what replaces it locally*. **Green dot = stage working.** Red means that part is failing. |
| **Forecast-to-capacity pipeline** | The loop from section 1 drawn as steps | Static diagram; hover a number for details. |

### 4.2 Forecast: "How many viewers are coming?"

| Card | What it shows |
|---|---|
| **5 small region cards** | Current viewers per region, with a mini chart of the last 6 hours. |
| **Demand forecast chart** | The main chart. Read it left to right. |
| **Recent points table** | The numbers behind the chart around "now". *Observed* rows are the past; *Forecast* rows are the prediction. |

**Reading the main chart:**

- **Orange line = Actual.** What really happened.
- **Teal line = P50 forecast.** What the model predicted.
- **Blue band top = P90.** The safe upper estimate.
- **Dashed "Now" line.** Everything to the right is the future (orange stops there).
- **Good sign:** the orange line stays close to teal and under the blue top.
- **Buttons:** pick the region, and 15m/30m/60m for how far ahead to look. Longer horizons
  give a wider band, because the model is less sure about the far future.
- The subtitle says which model made the forecast (e.g. *XGBoost*). The system picks the
  best model automatically (see Benchmarking).

### 4.3 Capacity: "How many servers do we need?"

This is where forecasts become servers.

| Card | What it shows |
|---|---|
| **Required units** | Servers needed based on the forecast (the "vs. provisioned" % compares with what's running now). |
| **Needs approval** | Changes too big to do automatically. |
| **Resource pools** | Region × server-type combinations (5 regions × 4 types = 20). |
| **Est. daily cost** | What the required servers would cost per day. |
| **Current vs. required by region** (bar chart) | Purple = servers running now, blue = servers needed. Purple taller than blue means over-provisioned (wasting money); blue taller means under-provisioned (risk of buffering). |
| **Capacity recommendations** table | One row per pool. See the columns below. |
| **Scaling decision audit** | Every change actually made: time, `from → to` units, who triggered it (automatic or approved by a person), and **AWS desired** (the value the simulated AWS ECS service now reports, which shows the change really went through). |

**Table columns:**
- **Current / Required**: servers now vs servers needed.
- **Guardrails**:
  - *Hysteresis on*: the system is deliberately *not* removing servers yet. It waits until
    demand stays low for 2 periods, so it doesn't flip-flop.
  - *Cooldown*: it recently scaled down and must wait.
- **Est. cost**: daily cost at the required size.
- **Decision**:
  - 🟢 *Auto-execute*: small change, done automatically.
  - 🟠 *Needs approval*: big change; it appears on the Alerts page.
  - ⚪ *Recommend*: a suggestion only.

**Click any row** to see the math:
`required = ceil(P90 ÷ viewers-per-server × (1 + 20% safety margin))`.

### 4.4 Confidence: "Can we trust the forecasts?"

The question here: *when the model said "90% sure demand stays below X", was it actually
below X 90% of the time?*

| Card | What it shows |
|---|---|
| **7 model cards** (Chronos … LSTM) | A confidence score 0–100 and a status. **Nominal** means fine. **Degraded** means it's drifting. **Fallback** means the system stopped trusting it and switched to the simple backup model. |
| **P90 calibration** bar chart | Actual coverage per model. The dashed line is the 90% target. Bars near the line are good. Far below means the model is over-confident (dangerous). Far above means it's too cautious (wastes money). |
| **Snapshot detail** table | The same data for all horizons. *Region* is the region where that model performs worst. |

The subtitle says whether it's **live** (checked against the last 4 hours of real outcomes)
or **backtest** (from offline testing, shown for the first half-hour after connecting).

### 4.5 Alerts: "What needs a human decision?"

| Alert type | Meaning | What Approve does |
|---|---|---|
| **Scale X in region to N units** (warning) | A big capacity change was proposed | **Actually changes the server count** in (simulated) AWS. A toast confirms `from → to`. |
| **…exceeds budget** (critical) | Needed servers would cross the daily budget | Approves scaling up to the budget cap. |
| **SLA risk** (critical) | Demand is higher than current servers right now | Acknowledges it. |
| **Predicted demand peak** (info) | The 60-minute forecast shows a big rise coming (often a scheduled match or release) | Acknowledges it. |
| **… falling back to seasonal-naive** (critical) | Forecast confidence dropped, so the planner switched to the backup model | Acknowledges it. |
| **Auto-scaled …** (auto-executed) | A record of a medium-size change done automatically | Nothing to do. |

**Reject** declines the change and stops the same proposal for 30 simulated minutes.
The tabs filter by status; the dropdowns filter by region and severity. Warning and critical
alerts are also "sent" through simulated AWS SNS (see the AWS Accounts page).

### 4.6 Cost & SLA: "What does it cost, and are viewers happy?"

| Card | What it shows |
|---|---|
| **4 KPIs** | Server cost, model (inference) cost, SLA-violation minutes, and scaling oscillations (times it scaled up then quickly down; fewer is more stable) over the selected period (7/14/30 days). |
| **Cost forecast** | Cost prediction. **Next hour** is a cost range from the P50 and P90 demand forecasts. **Today so far** is what's been spent today. **Next 14 days** is a forecast total. **Month-end** is the projected bill for the month. In the chart, the solid line is past daily cost and the dashed line with its shaded band is predicted cost (80% range). |
| **Cost trend** | Daily spend. The last day is "today", which is still in progress, so it looks lower. |
| **SLA violations** | Buffering minutes per day. Zero is ideal. |
| **Scaling policy comparison (backtest)** | **The key result of the project.** The same week of traffic was replayed with different strategies: *Static schedule* (fixed plan), *Reactive* (the usual "add servers when CPU hits 70%"), and *Predictive* (this project) with each model. Left chart: buffering minutes (lower is better). Right chart: total cost (lower is better). The table's **vs. reactive** column shows the saving; the one marked **in use** is what the live system runs. Result: predictive P90 with XGBoost costs ~13% less than reactive and has fewer SLA minutes. |
| **Event log** | Per day and region: overload events, under-used servers, oscillations, SLA minutes. |

Days before Sep 28 come from the offline test replay. From Sep 28 on, numbers build up live
as the simulation clock runs.

### 4.7 Benchmarking: "Which forecasting model is best?"

Seven models were tested on the same held-out week.

- **Foundation models** (Chronos, TimesFM, Moirai, TTM) are large pre-trained AI models from
  the research papers. **In this demo they are simulated**; the yellow banner and the
  *simulated* tag say so.
- **Baselines** (Seasonal Naive, XGBoost, LSTM) are real models trained on the data.

| Card | What it shows |
|---|---|
| **Error metrics** | MAE/RMSE: average forecast error in thousands of viewers. Shorter bars are better. |
| **Efficiency frontier** | Error vs speed. Bottom-left is best (accurate *and* fast). |
| **Model mix** | How many models of each kind are in the comparison. |
| **Benchmark table** | **MAE / RMSE / sMAPE / MASE**: error measures, lower is better (MASE below 1 means better than the simple "same as yesterday" model). **P90 cov.**: how often reality stayed under P90; the target is ~90%. **Latency / Cost/1k / Memory**: how expensive the model is to run. **Flash-crowd**: error and coverage during sudden spikes, the hardest case. The **selected** tag marks the model the system chose for this horizon. |

Use the 15m/30m/60m switch at the top right to change the horizon.

### 4.8 AWS Accounts: "Which AWS account are we managing?"

| Card | What it shows |
|---|---|
| **Connect an AWS account** | Choose a sample account and click **Launch quick-create stack**. A fake AWS CloudFormation page opens. It creates a permission role in that account; you tick the box and click **Create stack**. The dashboard then "logs into" the account with that role (the standard secure way SaaS tools connect to AWS). |
| **Linked accounts** | Connected accounts, their regions, the role used, and pending alerts. *Make active* switches the dashboard to that account. |
| **Scaling policy** | The rules the planner follows: safety margin, how long to wait before removing servers, budget, and when to ask for approval. **Decision mode** can be *Auto*, *Approve all* (a human approves every change) or *Recommend only* (never act). Only admins can edit. |
| **Simulation clock** | Current simulated time and tick counter. Admins can **Pause**, **Step 5 min**, or change the speed (e.g. 2 s per step to fast-forward to the 7–10 PM peak, where the interesting alerts appear). |
| **SNS deliveries** | Notifications "sent" for warning and critical alerts through simulated AWS SNS. |

---

## 5. A 10-minute guided tour

1. **Sign in** as `admin@capplan.example` / `Admin#2026`.
2. **AWS Accounts** → pick *StreamCo Production* → *Launch quick-create stack* → tick the box
   → *Create stack*. You land back on the dashboard with the account connected.
3. **Overview**: check all 8 pipeline boxes have green dots.
4. **Forecast**: pick *US East*, 15m. Watch the orange line (actual) track the teal line
   (forecast). Switch to 60m and see the band widen.
5. **AWS Accounts → Simulation clock**: set speed to `2`, click *Set speed*. Time now moves
   about 5× faster.
6. **Capacity**: watch *Required* change as evening demand rises. Click a row to see the
   formula. Scroll to the **Scaling decision audit** and watch automatic changes appear.
7. **Alerts**: when a *"Scale … to N units"* warning appears, click **Approve**. The toast
   shows the server count changing in AWS. Check it in the Capacity audit table
   (trigger = *approved by you*).
8. **Cost & SLA**: look at *Cost forecast* (what the next hour and month will cost) and
   *Scaling policy comparison* (why predicting beats reacting).
9. **Benchmarking**: see which model won and why (15m → XGBoost).
10. Sign out, sign in as `operator@capplan.example` / `Operator#2026`. Try editing the scaling
    policy: it's read-only, because operators can't change policy.

---

## 6. Where each number comes from

| Page | Backend API | Source |
|---|---|---|
| Forecast | `/api/forecasts` | Models run every tick on replayed viewer data |
| Capacity | `/api/capacity`, `/api/capacity/decisions` | Capacity planner + simulated AWS ECS |
| Confidence | `/api/confidence` | Forecast vs actual over the last 4 h |
| Alerts | `/api/alerts` | Planner decisions; approve calls simulated AWS |
| Cost & SLA | `/api/cost-sla`, `/api/cost/forecast`, `/api/cost-sla/policies` | Server-hours × AWS prices; offline policy replay |
| Benchmarking | `/api/benchmarks` | Offline backtest (`results/benchmark.csv`) |
| Overview | `/api/pipeline/status` | Health of each pipeline stage |

Interactive API docs: http://localhost:8000/docs.
