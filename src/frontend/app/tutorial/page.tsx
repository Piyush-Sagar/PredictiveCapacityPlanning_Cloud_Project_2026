"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Circle, MousePointerClick, PlayCircle, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useTour } from "@/components/tour/tour-provider";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { IS_LIVE } from "@/lib/config";
import { GLOSSARY, PAGE_GUIDES, TOUR_STEPS } from "@/lib/guide-content";
import { TOURS } from "@/lib/tour-steps";
import { cn } from "@/lib/utils";

const PROGRESS_KEY = "cp_tutorial_done";

const LOOP = [
  { n: 1, title: "Measure", body: "How many viewers are watching right now, per region." },
  { n: 2, title: "Forecast", body: "How many will watch in 15 / 30 / 60 minutes (P50 and P90)." },
  { n: 3, title: "Translate", body: "Viewers → number of servers needed, plus a 20% safety margin." },
  { n: 4, title: "Guardrails", body: "Don't flip-flop, don't exceed the budget, stay within min/max." },
  { n: 5, title: "Act", body: "Small change → done automatically. Big change → a human approves." },
  { n: 6, title: "Check", body: "Was the forecast right? If not, switch to a safer backup model." },
];

export default function TutorialPage() {
  const [done, setDone] = useState<number[]>([]);
  const tour = useTour();

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- progress lives in localStorage, unavailable during SSR
      if (Array.isArray(saved)) setDone(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  function save(next: number[]) {
    setDone(next);
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const toggle = (i: number) => save(done.includes(i) ? done.filter((d) => d !== i) : [...done, i]);
  const nextStep = TOUR_STEPS.findIndex((_, i) => !done.includes(i));

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MousePointerClick className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold">Interactive tour</p>
            <p className="text-sm text-muted-foreground">
              A 3-minute walkthrough on the live dashboard. It highlights each part, moves between pages for you, and
              asks you to try a few things. Use → / ← keys, Esc to exit. Restart any time with the 🎓 button in the top bar.
            </p>
          </div>
          <Button size="lg" onClick={() => tour.start("full")}>
            Start interactive tour <ArrowRight />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Section tours</CardTitle>
          <CardDescription>
            Short, deeper tours of one page each. Also available from the “Take the … tour” button under every page title.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TOURS.filter((t) => t.section).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => tour.start(t.id)}
              className="flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <PlayCircle className="size-4 text-primary" />
                {t.title}
              </span>
              <span className="text-xs text-muted-foreground">{t.description}</span>
              <span className="text-[11px] text-muted-foreground">{t.steps.length} steps</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What is this?</CardTitle>
          <CardDescription>The idea in one minute.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            Imagine a video streaming service (think Netflix or Hotstar) with viewers in five regions. The number of
            people watching changes all day. It is low at 5 AM, peaks around 9 PM, and jumps during a live match or a
            new episode release.
          </p>
          <p>
            Viewers are served by <b>servers rented on AWS</b>. Too few servers and the video buffers (an{" "}
            <b>SLA violation</b>); too many and money is wasted. Most companies react <i>after</i> traffic rises, but
            new servers take ~10 minutes to start, so viewers buffer in the meantime.
          </p>
          <p className="rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 font-medium">
            This dashboard predicts demand 15–60 minutes ahead and adds servers <i>before</i> the spike arrives, while
            keeping cost down.
          </p>
          <p className="text-muted-foreground">
            Everything runs on your machine: AWS is <b>simulated</b> and viewer data is a generated, realistic replay.
            The <b>simulation clock</b> in the top bar moves time 5 minutes every few seconds, so you can watch a whole
            evening in minutes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The loop that runs every 5 simulated minutes</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LOOP.map((s) => (
            <div key={s.n} className="flex gap-3 rounded-lg border p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {s.n}
              </span>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Words you&apos;ll see everywhere</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GLOSSARY.map((g) => (
            <div key={g.title} className="rounded-lg bg-muted/40 p-3">
              <p className="font-mono text-sm font-semibold text-primary">{g.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guided tour</CardTitle>
          <CardDescription>
            {done.length}/{TOUR_STEPS.length} steps done. Open each step, do the action, then tick it off.
            {IS_LIVE ? " Sign in as admin to do the clock step." : " Some steps need live mode (docker compose / make dev)."}
          </CardDescription>
          {done.length > 0 && (
            <CardAction>
              <button
                type="button"
                onClick={() => save([])}
                className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5" /> Reset
              </button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(done.length / TOUR_STEPS.length) * 100}%` }} />
          </div>
          {TOUR_STEPS.map((step, i) => {
            const isDone = done.includes(i);
            const isNext = i === nextStep;
            return (
              <div
                key={step.title}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center",
                  isNext && "border-primary/60 bg-primary/5",
                  isDone && "opacity-60"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-label={isDone ? `Mark step ${i + 1} as not done` : `Mark step ${i + 1} as done`}
                  className="shrink-0 cursor-pointer self-start text-primary sm:self-center"
                >
                  {isDone ? <CheckCircle2 className="size-5" /> : <Circle className="size-5 text-muted-foreground" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {i + 1}. {step.title}
                  </p>
                  <p className="text-xs">
                    <span className="font-medium">Do: </span>
                    {step.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Look for: </span>
                    {step.lookFor}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={step.href} className={buttonVariants({ size: "sm", variant: isNext ? "default" : "outline" })}>
                    Go <ArrowRight className="size-3.5" />
                  </Link>
                  {!isDone && (
                    <button type="button" onClick={() => toggle(i)} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                      <Check className="size-3.5" /> Done
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What each page answers</CardTitle>
          <CardDescription>Every page also has a “How to read this page” button under its title.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NAV_ITEMS.filter((item) => PAGE_GUIDES[item.href]).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{PAGE_GUIDES[item.href].question}</p>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
