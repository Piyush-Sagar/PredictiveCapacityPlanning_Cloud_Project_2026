"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  PlayCircle,
} from "lucide-react";

import { useTour } from "@/components/tour/tour-provider";
import { PAGE_GUIDES } from "@/lib/guide-content";
import { tourForSection } from "@/lib/tour-steps";
import { cn } from "@/lib/utils";

const storageKey = (path: string) => `cp_guide_seen:${path}`;

/** "How to read this page" panel under each page title. Opens automatically on a page's first visit. */
export function PageGuide({ pathname }: { pathname: string }) {
  const guide = PAGE_GUIDES[pathname];
  const sectionTour = tourForSection(pathname);
  const [open, setOpen] = useState(false);
  const tour = useTour();

  useEffect(() => {
    // Don't compete with the interactive tour for attention.
    if (!guide || tour.active) return;
    try {
      if (!window.localStorage.getItem(storageKey(pathname))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- first-visit state lives in localStorage, unavailable during SSR
        setOpen(true);
      }
    } catch {
      /* storage blocked: stay collapsed */
    }
  }, [guide, pathname, tour.active]);

  if (!guide) return null;

  function toggle() {
    setOpen((was) => {
      if (was) {
        try {
          window.localStorage.setItem(storageKey(pathname), "1");
        } catch {
          /* ignore */
        }
      }
      return !was;
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {sectionTour && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              tour.start(sectionTour.id);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            <PlayCircle className="size-3.5" />
            Take the {sectionTour.title.replace(" tour", "")} tour
            <span className="opacity-70">
              · {sectionTour.steps.length} steps
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <HelpCircle className="size-3.5" />
          How to read this page
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold">
            This page answers:{" "}
            <span className="text-primary">{guide.question}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{guide.summary}</p>

          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
            {guide.items.map((item) => (
              <div key={item.title} className="text-xs leading-relaxed">
                <dt className="font-semibold text-foreground">{item.title}</dt>
                <dd className="text-muted-foreground">{item.body}</dd>
              </div>
            ))}
          </dl>

          {guide.tryThis && (
            <div className="mt-3 flex gap-2 rounded-md bg-background/60 p-2.5 text-xs">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
              <div>
                <span className="font-semibold">Try this: </span>
                {guide.tryThis.join(" ")}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={toggle}
              className="cursor-pointer rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:bg-primary/80"
            >
              Got it
            </button>
            <Link
              href="/tutorial"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <GraduationCap className="size-3.5" /> Full dashboard tutorial
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
