"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  MousePointerClick,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { IS_LIVE } from "@/lib/config";
import { tourById, type TourStepDef } from "@/lib/tour-steps";

const STEP_KEY = "cp_tour_step";
const PROMPT_KEY = "cp_tour_prompted";
const POPOVER_W = 360;
const PAD = 6;

interface TourState {
  active: boolean;
  tourId: string | null;
  start: (tourId?: string) => void;
}

const TourContext = createContext<TourState>({
  active: false,
  tourId: null,
  start: () => undefined,
});

export function useTour() {
  return useContext(TourContext);
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

interface Found {
  key: string;
  rect: { top: number; left: number; width: number; height: number } | null;
  missing: boolean;
}

/**
 * Interactive product tour: spotlights real dashboard elements (marked with
 * `data-tour="…"`), navigates between pages, and waits for the user to click
 * on "your turn" steps. Progress survives navigation and reloads.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tourId, setTourId] = useState<string>("full");
  const tour = tourById(tourId) ?? tourById("full")!;
  const steps = useMemo(
    () => tour.steps.filter((s) => IS_LIVE || !s.liveOnly),
    [tour],
  );
  const [index, setIndex] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [mounted, setMounted] = useState(false);

  // Restore progress / decide whether to offer the tour (client-only state).
  useEffect(() => {
    let saved: { tourId?: string; index?: number } | null = null;
    try {
      saved = JSON.parse(read(STEP_KEY) ?? "null");
    } catch {
      saved = null;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage and portals are unavailable during SSR */
    setMounted(true);
    if (
      saved &&
      typeof saved.index === "number" &&
      saved.tourId &&
      tourById(saved.tourId)
    ) {
      setTourId(saved.tourId);
      setIndex(saved.index);
    } else if (!read(PROMPT_KEY)) setShowPrompt(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const go = useCallback(
    (next: number | null, id: string = tourId) => {
      setIndex(next);
      write(
        STEP_KEY,
        next === null ? null : JSON.stringify({ tourId: id, index: next }),
      );
    },
    [tourId],
  );

  const start = useCallback(
    (id: string = "full") => {
      write(PROMPT_KEY, "1");
      setShowPrompt(false);
      setTourId(id);
      go(0, id);
    },
    [go],
  );

  const end = useCallback(() => {
    write(PROMPT_KEY, "1");
    go(null);
  }, [go]);

  const step: TourStepDef | null =
    index !== null ? (steps[Math.min(index, steps.length - 1)] ?? null) : null;
  const stepKey =
    index !== null ? `${tourId}:${index}:${step?.target ?? ""}` : "";
  const next = useCallback(() => {
    if (index === null) return;
    if (index >= steps.length - 1) end();
    else go(index + 1);
  }, [index, steps.length, end, go]);
  const back = useCallback(() => {
    if (index !== null && index > 0) go(index - 1);
  }, [index, go]);

  // Take the user to the step's page.
  useEffect(() => {
    if (step && pathname !== step.path && !pathname.startsWith("/login"))
      router.push(step.path);
  }, [step, pathname, router]);

  // Find and follow the target element (it may render late, after data loads).
  useEffect(() => {
    if (!step || pathname !== step.path || !step.target) return;
    let raf = 0;
    let el: Element | null = null;
    let scrolled = false;
    const t0 = performance.now();
    const loop = () => {
      if (!el || !el.isConnected)
        el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        if (!scrolled) {
          scrolled = true;
          el!.scrollIntoView({
            block: r.height > window.innerHeight * 0.7 ? "start" : "center",
            behavior: "smooth",
          });
        }
        const rect = {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
        setFound((prev) =>
          prev &&
          prev.key === stepKey &&
          prev.rect &&
          !prev.missing &&
          prev.rect.top === rect.top &&
          prev.rect.left === rect.left &&
          prev.rect.width === rect.width &&
          prev.rect.height === rect.height
            ? prev
            : { key: stepKey, rect, missing: false },
        );
      } else if (performance.now() - t0 > 5000) {
        setFound((prev) =>
          prev?.key === stepKey && prev.missing
            ? prev
            : { key: stepKey, rect: null, missing: true },
        );
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [step, stepKey, pathname]);

  // "Your turn" steps advance when the user clicks the right thing.
  useEffect(() => {
    if (!step?.advanceOn || !step.target) return;
    let timer: ReturnType<typeof setTimeout>;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const container = document.querySelector(`[data-tour="${step.target}"]`);
      if (
        target &&
        container?.contains(target) &&
        target.closest(step.advanceOn!)
      ) {
        timer = setTimeout(() => {
          // Close anything the click opened (e.g. the capacity detail sheet).
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
          next();
        }, 1800);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    };
  }, [step, next]);

  // Keyboard: → next, ← back, Esc exits (ignoring our own synthetic Escape).
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Escape") end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, next, back, end]);

  const value = useMemo(
    () => ({
      active: index !== null,
      tourId: index !== null ? tourId : null,
      start,
    }),
    [index, tourId, start],
  );
  const onRightPage = step && pathname === step.path;
  const current = found && found.key === stepKey ? found : null;
  const hideOn = pathname.startsWith("/login");

  return (
    <TourContext.Provider value={value}>
      {children}
      {mounted &&
        !hideOn &&
        step &&
        onRightPage &&
        createPortal(
          <TourOverlay
            step={step}
            tourTitle={tour.title}
            index={index!}
            total={steps.length}
            rect={step.target ? (current?.rect ?? null) : null}
            searching={Boolean(step.target) && !current}
            missing={Boolean(current?.missing)}
            onNext={next}
            onBack={back}
            onEnd={end}
          />,
          document.body,
        )}
      {mounted &&
        !hideOn &&
        showPrompt &&
        index === null &&
        pathname !== "/tutorial" &&
        createPortal(
          <TourPrompt
            onStart={start}
            onDismiss={() => {
              write(PROMPT_KEY, "1");
              setShowPrompt(false);
            }}
          />,
          document.body,
        )}
    </TourContext.Provider>
  );
}

function TourOverlay({
  step,
  tourTitle,
  index,
  total,
  rect,
  searching,
  missing,
  onNext,
  onBack,
  onEnd,
}: {
  step: TourStepDef;
  tourTitle: string;
  index: number;
  total: number;
  rect: Found["rect"];
  searching: boolean;
  missing: boolean;
  onNext: () => void;
  onBack: () => void;
  onEnd: () => void;
}) {
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(260);
  // Re-measure whenever the card's content changes, so it can be placed where it fits.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 2) setCardH(h);
  }, [cardH, step, searching, missing, vw, vh]);

  // Spotlight clipped to the viewport (targets can be taller than the screen).
  const spot = rect
    ? (() => {
        const top = Math.max(rect.top - PAD, 8);
        const bottom = Math.min(rect.top + rect.height + PAD, vh - 8);
        return {
          top,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: Math.max(bottom - top, 24),
        };
      })()
    : null;

  let pos: React.CSSProperties;
  const width = Math.min(POPOVER_W, vw - 32);
  if (!spot) {
    pos = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(460, vw - 32),
    };
  } else {
    const left = Math.min(Math.max(spot.left, 16), vw - width - 16);
    const gap = 12;
    const below = vh - (spot.top + spot.height) - gap - 16;
    const above = spot.top - gap - 16;
    if (below >= cardH)
      pos = { top: spot.top + spot.height + gap, left, width };
    else if (above >= cardH) pos = { top: spot.top - gap - cardH, left, width };
    // Target fills the screen: pin the card inside the viewport's bottom-right corner.
    else
      pos = {
        top: Math.max(16, vh - cardH - 16),
        left: vw - width - 16,
        width,
      };
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1000]"
      aria-live="polite"
    >
      {spot ? (
        <div
          className="absolute rounded-lg border-2 border-primary transition-all duration-300 ease-out"
          style={{ ...spot, boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-label={step.title}
        className="pointer-events-auto absolute max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-primary/40 bg-popover p-4 text-popover-foreground shadow-2xl transition-[top,left] duration-300"
        style={pos}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium tracking-wide text-primary uppercase">
            {tourTitle} · {index + 1}/{total}
          </p>
          <button
            type="button"
            onClick={onEnd}
            aria-label="End tour"
            className="-mt-1 -mr-1 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-base font-semibold">{step.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>

        {step.advanceOn && spot && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
            <MousePointerClick className="size-4 shrink-0 animate-pulse" />
            {step.actionHint ?? "Click the highlighted element"}
          </p>
        )}
        {searching && (
          <p className="mt-3 text-xs text-muted-foreground">
            Finding this on the page…
          </p>
        )}
        {missing && (
          <p className="mt-3 rounded-md bg-status-warning/10 px-2.5 py-1.5 text-xs text-status-warning">
            This part isn&apos;t on screen right now. It appears once an AWS
            account is connected and data has loaded.
          </p>
        )}

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onEnd}
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button size="sm" variant="outline" onClick={onBack}>
                <ArrowLeft /> Back
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {index === total - 1
                ? "Finish"
                : step.advanceOn
                  ? "Skip step"
                  : "Next"}
              {index < total - 1 && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TourPrompt({
  onStart,
  onDismiss,
}: {
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed right-4 bottom-4 z-[900] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-primary/40 bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <GraduationCap className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">New here?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Take the 3-minute interactive tour. It highlights each part of the
            dashboard and explains what it shows.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => onStart()}>
              Start tour
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              No thanks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
