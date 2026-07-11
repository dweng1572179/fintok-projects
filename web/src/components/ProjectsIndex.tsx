import Link from "next/link";

/**
 * /projects — public index. fourthspaceOS-under-FinTok-branding: dark
 * editorial register (bg-[#0B0B0C]), NOT the gated app shell. Renders its
 * own minimal header (this page and its guide subpages are the only public
 * surfaces that don't use the product TopUtilityBar); SiteFooter is already
 * global via RootLayout, so it is not re-rendered here.
 *
 * Fully static — no fetch, no backend dependency. PROJECTS is a local const;
 * new entries append to the list without touching layout.
 *
 * Ported from fintok/frontend/src/components/projects/ProjectsIndex.tsx —
 * content verbatim. This standalone app's `basePath: "/projects"` (see
 * next.config.ts) auto-prepends "/projects" to every next/link href, so
 * hrefs that pointed at `/projects/<slug>` in the monorepo become `/<slug>`
 * here. The wordmark still points at the real fintok.news homepage, which
 * lives in the OTHER app — that's an absolute URL, left untouched by
 * basePath (Link doesn't rewrite hrefs that start with a protocol).
 */
const PROJECTS = [
  {
    slug: "om-builder",
    name: "OM Builder",
    tagline:
      "Institutional-grade offering memorandums from your own deal documents — built on your machine, your data never leaves it.",
    status: "Live",
  },
];

export function ProjectsIndex() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      {/* Minimal header — wordmark only, no product nav. The "Projects" label
          lives once in the hero eyebrow below; repeating it here read as
          redundant during design review. */}
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <Link
            href="https://www.fintok.news/"
            className="font-mono text-[13px] uppercase tracking-nav text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            Fintok.news
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="mb-6 font-mono text-[11px] uppercase tracking-eyebrow text-white/45">
          Projects
        </div>
        <h1 className="font-masthead uppercase leading-[0.92] tracking-tight text-[48px] sm:text-[64px] md:text-[84px]">
          Projects,{" "}
          <span className="font-display italic normal-case tracking-normal text-white/85">
            owned
          </span>
          .
        </h1>
        <p className="mt-7 max-w-xl text-[16px] leading-relaxed text-white/60 md:text-[17px]">
          AI workflows you can own — built by FinTok, documented end to end,
          free to build yourself or ready-made if you&rsquo;d rather not.
        </p>
      </section>

      {/* Project cards */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl divide-y divide-white/10 px-6">
          {PROJECTS.map((p, i) => (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              className="group -mx-6 flex flex-col gap-6 px-6 py-10 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-inset md:flex-row md:items-center md:justify-between md:gap-10 md:py-14"
            >
              <div className="min-w-0 md:flex-1">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-mono text-[13px] text-white/35 md:hidden">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-masthead uppercase tracking-tight text-[26px] text-white transition-colors group-hover:text-white/90 md:text-[34px]">
                    {p.name}
                  </h2>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-eyebrow text-white/40">
                    {p.status.toLowerCase() === "live" && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                        aria-hidden="true"
                      />
                    )}
                    {p.status}
                  </span>
                </div>
                <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-white/55">
                  {p.tagline}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-nav text-white/70 transition-colors group-hover:text-white">
                  Read the guide
                  <span className="inline-block transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
              {/* Oversized index numeral as a compositional anchor for the
                  wide right-hand region — fourthspaceOS/editorial move.
                  Hidden on mobile, where the small numeral above the title
                  already carries the wayfinding role. */}
              <span
                aria-hidden="true"
                className="hidden select-none font-mono text-[140px] font-medium leading-none tracking-tighter text-white/[0.06] transition-colors group-hover:text-white/[0.11] md:block"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
