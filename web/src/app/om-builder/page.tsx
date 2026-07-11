import type { Metadata } from "next";
import { OmBuilderPage } from "@/components/OmBuilderPage";

export const metadata: Metadata = {
  title: "OM Builder — Projects",
  description:
    "Build institutional-grade CRE offering memorandums from your own deal documents. Free step-by-step guide, or a ready-made bundle — pay what you want.",
};

export default function Page() {
  return <OmBuilderPage />;
}
