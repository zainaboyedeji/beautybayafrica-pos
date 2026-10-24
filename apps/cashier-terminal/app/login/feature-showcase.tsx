"use client";

import { useEffect, useState, type ReactNode } from "react";

const SLIDE_MS = 4500;

// Small mock screens of each feature, drawn with plain divs so they stay
// crisp and on-palette without shipping screenshots.
const CARD =
  "w-72 rounded-2xl bg-white p-5 text-ink shadow-xl shadow-brand-deep/20";

const SLIDES: { title: string; text: string; visual: ReactNode }[] = [
  {
    title: "Fast checkout",
    text: "Scan or tap products, take payment and print a receipt in seconds.",
    visual: (
      <div className={CARD}>
        {[
          ["Glow Serum", "₦12,500"],
          ["Shea Body Butter", "₦6,800"],
          ["Matte Lip Kit", "₦9,200"],
        ].map(([name, price]) => (
          <div
            key={name}
            className="flex justify-between border-b border-line py-2 text-sm"
          >
            <span>{name}</span>
            <span className="text-muted">{price}</span>
          </div>
        ))}
        <div className="mt-3 flex justify-between font-semibold">
          <span>Total</span>
          <span>₦28,500</span>
        </div>
        <div className="mt-4 rounded-lg bg-brand py-2 text-center text-sm font-semibold">
          Charge
        </div>
      </div>
    ),
  },
  {
    title: "Live inventory",
    text: "Stock levels update with every sale, so you always know what's on the shelf.",
    visual: (
      <div className={CARD}>
        {[
          ["Cleansers", 85],
          ["Lipsticks", 60],
          ["Fragrances", 35],
          ["Hair care", 15],
        ].map(([name, pct]) => (
          <div key={name} className="py-2">
            <div className="flex justify-between text-sm">
              <span>{name}</span>
              <span className="text-muted">{pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-brand-soft">
              <div
                className={`h-2 rounded-full ${Number(pct) < 20 ? "bg-brand-deep" : "bg-brand"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Sales at a glance",
    text: "See today's takings, best sellers and trends from the back office.",
    visual: (
      <div className={CARD}>
        <p className="text-xs text-muted">Today</p>
        <p className="text-2xl font-semibold">₦482,300</p>
        <div className="mt-4 flex h-28 items-end gap-2">
          {[40, 65, 50, 80, 70, 95, 60].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-md ${i === 5 ? "bg-brand" : "bg-brand-soft"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Know your customers",
    text: "Save customer details at the till and reward your regulars.",
    visual: (
      <div className={CARD}>
        {[
          ["AO", "Adaeze O.", "14 visits"],
          ["TK", "Tobi K.", "9 visits"],
          ["FM", "Fatima M.", "6 visits"],
        ].map(([initials, name, visits]) => (
          <div key={name} className="flex items-center gap-3 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep">
              {initials}
            </span>
            <span className="flex-1 text-sm">{name}</span>
            <span className="text-xs text-muted">{visits}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Synced with your store",
    text: "Products and sales stay in step with the Beauty Bay Africa online shop.",
    visual: (
      <div className={`${CARD} flex items-center justify-between`}>
        <div className="text-center">
          <div className="mx-auto h-12 w-16 rounded-md border-2 border-ink" />
          <p className="mt-2 text-xs text-muted">Till</p>
        </div>
        <div className="flex flex-1 justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full border-2 border-ink" />
          <p className="mt-2 text-xs text-muted">Online shop</p>
        </div>
      </div>
    ),
  },
];

export default function FeatureShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      SLIDE_MS,
    );
    return () => clearTimeout(id);
  }, [index, paused]);

  return (
    <section
      aria-label="Features"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative hidden flex-1 flex-col overflow-hidden bg-brand-deep text-white lg:flex"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand/30 blur-3xl" />

      <div className="relative flex flex-1 overflow-hidden">
        <div
          className="flex w-full transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((slide, i) => (
            <div
              key={slide.title}
              aria-hidden={i !== index}
              className="flex w-full shrink-0 flex-col items-center justify-center px-12 text-center"
            >
              {slide.visual}
              <h2 className="mt-10 text-3xl">{slide.title}</h2>
              <p className="mt-3 max-w-sm text-white/80">{slide.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex justify-center gap-2 pb-10">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Show ${slide.title}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
