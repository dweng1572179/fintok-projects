import type { Metadata } from "next";
import { ProjectsIndex } from "@/components/ProjectsIndex";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "AI workflows you can own — built by FinTok, documented end to end, free to build yourself or ready-made if you'd rather not.",
};

export default function ProjectsPage() {
  return <ProjectsIndex />;
}
