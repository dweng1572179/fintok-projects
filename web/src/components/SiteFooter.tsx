/**
 * Minimal footer for the standalone /projects app — ported from fintok's
 * global `SiteFooter` (frontend/src/components/layout/SiteFooter.tsx). That
 * component lives in the main fintok.news app and links to legal pages
 * (/terms, /privacy, /disclaimer, /copyright) that are served by that same
 * app, not this one — so here every legal link is an ABSOLUTE URL back to
 * www.fintok.news. The design-system color tokens (bg-ds-navy, text-ds-card,
 * etc.) aren't ported; this uses the underlying hex values directly since
 * this is the only place in this app that needs them.
 */
const LEGAL_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "https://www.fintok.news/disclaimer", label: "Disclaimer" },
  { href: "https://www.fintok.news/terms", label: "Terms of Service" },
  { href: "https://www.fintok.news/privacy", label: "Privacy Policy" },
  { href: "https://www.fintok.news/copyright", label: "Copyright & DMCA" },
];

export default function SiteFooter() {
  return (
    <footer className="bg-[#0a2e6e] text-white" aria-label="Site footer">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-10 md:py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand block */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 mb-3">
              <img
                src="https://www.fintok.news/logo.jpeg"
                alt=""
                width={32}
                height={32}
                className="rounded"
              />
              <span className="font-display text-[20px] font-extrabold tracking-[-0.02em]">
                FinTok
              </span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-white/60">
              The intelligence layer for commercial real estate.
            </p>
          </div>

          {/* Legal navigation */}
          <nav aria-label="Legal">
            <div className="text-[11px] tracking-eyebrow uppercase font-bold text-white/45 mb-3">
              Legal
            </div>
            <ul className="flex flex-col gap-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-[13px] text-white/80 hover:text-white no-underline transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Standing disclaimer */}
        <div className="mt-9 pt-6 border-t border-white/15">
          <p className="max-w-3xl text-[11.5px] leading-relaxed text-white/60">
            FinTok provides editorial intelligence for informational purposes
            only and is not investment, financial, legal, or tax advice.
            Nothing here is a recommendation to buy, sell, or hold any asset.
            See our{" "}
            <a
              href="https://www.fintok.news/disclaimer"
              className="underline underline-offset-2 hover:no-underline text-white/80"
            >
              full disclaimer
            </a>
            .
          </p>
        </div>

        {/* Copyright + aggregation notice */}
        <div className="mt-5 flex flex-col gap-2 text-[11px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 FinTok. All rights reserved.</span>
          <span>
            Content aggregated from third-party sources; all rights remain
            with their respective owners.
          </span>
        </div>
      </div>
    </footer>
  );
}
