"use client";

import { useRef, useState } from "react";

type CopyStatus = "idle" | "copied" | "fallback";

/* fourthspaceOS-style prompt box: monospace body, hairline border,
 * single Copy action. Used for prompts AND terminal commands.
 *
 * Clipboard writes can reject (no clipboard permission, insecure context,
 * browser policy) — when that happens we fall back to selecting the text
 * in the <pre> so the user can copy manually via Cmd/Ctrl+C, and say so
 * honestly rather than silently no-oping. */
export function PromptBlock({ label, text }: { label: string; text: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const preRef = useRef<HTMLPreElement>(null);

  const selectFallback = () => {
    try {
      const node = preRef.current;
      const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
      if (!node || !selection) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // Best-effort only — the "Select & copy" label already tells the
      // user the automatic copy failed regardless of selection support.
    }
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      selectFallback();
      setStatus("fallback");
    }
    setTimeout(() => setStatus("idle"), 2000);
  };

  const buttonLabel =
    status === "copied" ? "Copied ✓" : status === "fallback" ? "Select & copy" : "Copy";

  return (
    <div className="my-4 rounded-md border border-white/15 bg-white/[0.04]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-white/20 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80 transition-colors hover:border-white/40 hover:text-white"
        >
          {buttonLabel}
        </button>
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed text-white/85"
      >
        {text}
      </pre>
    </div>
  );
}
