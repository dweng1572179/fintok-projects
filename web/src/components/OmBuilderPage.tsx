import Link from "next/link";
import { PromptBlock } from "@/components/PromptBlock";
import { GUIDE_STEPS, GUMROAD_URL } from "@/components/guide-content";

/**
 * /projects/om-builder — public guide + pay-what-you-want split.
 * fourthspaceOS-under-FinTok-branding, same dark editorial register as
 * ProjectsIndex.tsx (bg-[#0B0B0C], own minimal header — not the gated
 * product shell). SiteFooter is already global via RootLayout, so it is
 * not re-rendered here.
 *
 * Fully static — GUIDE_STEPS/GUMROAD_URL are local consts, no fetch, no
 * backend dependency. The reader never downloads anything from us — the
 * guide teaches building the pipeline from scratch. Server component; the
 * only client island is PromptBlock (copy-to-clipboard).
 *
 * Ported from fintok/frontend/src/components/projects/OmBuilderPage.tsx —
 * content verbatim. The `/projects` breadcrumb link becomes `/` here since
 * this standalone app's `basePath: "/projects"` (next.config.ts) prepends
 * "/projects" to every next/link href automatically — `/` resolves to this
 * app's index (ProjectsIndex), i.e. fintok.news/projects. The wordmark
 * still points at the real fintok.news homepage in the OTHER app, so that
 * stays an absolute URL.
 */

// Short scannable labels for the step-chip breadcrumb — deliberately terser
// than GUIDE_STEPS[i].title, which reads as prose ("Understand what you're
// building") rather than a wayfinding label ("Architecture"). Zipped to
// GUIDE_STEPS by index since both are fixed at 7 steps.
const STEP_CHIP_LABELS = [
  "Install",
  "Architecture",
  "Maps skill",
  "Photo + template",
  "Master prompts",
  "Run it",
  "The app",
];

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

export function OmBuilderPage() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      {/* Header — wordmark + breadcrumb. Same register as ProjectsIndex's
          minimal header, extended with a second line since this is a
          second-level page (the index page is top-level and needs none). */}
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <Link
            href="https://www.fintok.news/"
            className="font-mono text-[13px] uppercase tracking-nav text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            Fintok.news
          </Link>
          <div className="mt-2 font-mono text-[11px] uppercase tracking-eyebrow text-white/40">
            <Link
              href="/"
              className="transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              Projects
            </Link>
            <span className="mx-2 text-white/25">/</span>
            <span className="text-white/60">OM Builder</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-14 md:pt-24 md:pb-16">
        <div className="mb-6 font-mono text-[11px] uppercase tracking-eyebrow text-white/45">
          Free guide &middot; prebuilt kit available
        </div>
        <h1 className="font-masthead uppercase leading-[0.94] tracking-tight text-[40px] sm:text-[54px] md:text-[68px]">
          Build an institutional OM from your own deal docs.
        </h1>
        <p className="mt-7 max-w-2xl text-[16px] leading-relaxed text-white/60 md:text-[17px]">
          It runs on your own machine, and nothing you upload ever leaves
          your computer. Build it yourself and it runs on the Claude
          subscription you already pay for; the ready-made bundle bills your
          own Anthropic API key instead. Any number it can&rsquo;t find in
          your documents comes back marked{" "}
          <span className="font-mono text-white/80">[TBD]</span>, never
          invented.
        </p>
      </section>

      {/* Two-path split */}
      <section className="border-y border-white/10">
        <div className="mx-auto grid max-w-5xl divide-y divide-white/10 px-6 md:grid-cols-2 md:divide-x md:divide-y-0">
          {/* Panel A — DIY */}
          <div className="flex flex-col py-10 md:py-12 md:pr-10">
            <div className="font-mono text-[12px] uppercase tracking-eyebrow text-white/45">
              Build it yourself
            </div>
            <div className="mt-1 font-masthead uppercase text-[24px] tracking-tight text-white md:text-[28px]">
              Free
            </div>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">
              Open Claude Code and build the whole product yourself, from
              scratch — three skills, three prompts, and the web app around
              them — following the seven-step guide below. Every step runs
              inside Claude Code in plain English — no coding experience
              needed. The only cost is whatever your existing Claude plan
              already costs.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="#step-01"
                className="inline-flex items-center justify-center rounded-control border border-white/25 px-5 py-3 font-mono text-[13px] uppercase tracking-nav text-white/90 transition-colors hover:border-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                Start the guide ↓
              </a>
            </div>
          </div>

          {/* Panel B — prebuilt */}
          <div className="flex flex-col py-10 md:py-12 md:pl-10">
            <div className="font-mono text-[12px] uppercase tracking-eyebrow text-white/45">
              Get it prebuilt
            </div>
            <div className="mt-1 font-masthead uppercase text-[24px] tracking-tight text-white md:text-[28px]">
              Pay what you want
            </div>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">
              The prebuilt bundle skips the setup: paste your Anthropic API
              key into one file, double-click one launcher, and a page opens
              in your browser. Drop your deal documents in, tell it anything
              it should know &mdash; or say nothing and let it build straight
              from your files &mdash; and download the finished OM as an
              editable PowerPoint. Each build typically bills your key
              $2&ndash;8.
            </p>
            <div className="mt-8">
              <a
                href={GUMROAD_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center rounded-control bg-white px-5 py-3 font-mono text-[13px] uppercase tracking-nav text-black transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                Get the bundle
              </a>
              <p className="mt-3 text-[13px] leading-relaxed text-white/45">
                Pay $0 if you want. Pay something if it&rsquo;s worth
                something to you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step-chip breadcrumb */}
      <section className="border-t border-white/10">
        <nav
          aria-label="Guide steps"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-3 px-6 py-6"
        >
          {GUIDE_STEPS.map((step, i) => (
            <span key={step.n} className="flex items-center">
              <a
                href={`#step-${step.n}`}
                className="rounded-control px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-nav text-white/55 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                {step.n} {STEP_CHIP_LABELS[i]}
              </a>
              {i < GUIDE_STEPS.length - 1 && (
                <span className="px-1 text-white/20" aria-hidden="true">
                  ›
                </span>
              )}
            </span>
          ))}
        </nav>
      </section>

      {/* The guide */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-6 pt-14 pb-4 md:pt-20">
          <h2 className="font-masthead uppercase leading-[0.94] tracking-tight text-[32px] md:text-[42px]">
            The{" "}
            <span className="font-display italic normal-case tracking-normal text-white/85">
              guide
            </span>
            .
          </h2>
        </div>

        <div className="mx-auto max-w-5xl divide-y divide-white/10 px-6">
          {GUIDE_STEPS.map((step) => (
            <div key={step.n} id={`step-${step.n}`} className="scroll-mt-8 py-14 md:py-16">
              <div className="flex items-start gap-5 md:gap-8">
                <span className="w-10 shrink-0 pt-1 font-mono text-[15px] text-white/30 md:text-[17px]">
                  {step.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-masthead uppercase tracking-tight text-[24px] text-white md:text-[30px]">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/60 md:text-[16px]">
                    {step.intro}
                  </p>

                  <ol className="mt-9 space-y-9">
                    {step.substeps.map((sub, i) => (
                      <li key={sub.label} className="flex gap-4 md:gap-5">
                        <span className="w-7 shrink-0 font-mono text-[13px] text-white/35">
                          {ROMAN[i] ?? i + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-white/90">
                            {sub.label}
                          </p>
                          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-white/60">
                            {sub.body}
                          </p>
                          {sub.prompt && (
                            <PromptBlock
                              label={sub.prompt.label}
                              text={sub.prompt.text}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                  {step.callout && (
                    <div className="mt-9 max-w-2xl border-l-2 border-white/30 pl-4 md:pl-6">
                      <p className="font-display italic text-[16px] text-white/85">
                        {step.callout.title}
                      </p>
                      <p className="mt-2 text-[14px] leading-relaxed text-white/55">
                        {step.callout.body}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer of guide — repeats the Gumroad CTA */}
      <section className="border-t border-white/10">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-5 px-6 py-16 md:py-20">
          <h2 className="font-masthead uppercase leading-[0.94] tracking-tight text-[26px] md:text-[32px]">
            Rather skip all of this?
          </h2>
          <p className="max-w-md text-[15px] leading-relaxed text-white/55">
            Same output, no terminal, no setup. Bring your own Anthropic API
            key and pay what it&rsquo;s worth to you.
          </p>
          <a
            href={GUMROAD_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center justify-center rounded-control bg-white px-5 py-3 font-mono text-[13px] uppercase tracking-nav text-black transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            Get the bundle
          </a>
        </div>
      </section>
    </div>
  );
}
