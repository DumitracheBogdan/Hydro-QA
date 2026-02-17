import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockProject } from "@/lib/mock-data";

export default async function ProjectsPage() {
  const bypass = process.env.ENABLE_DEV_AUTH_BYPASS === "true";
  const projects = bypass
    ? [mockProject as any]
    : await prisma.project.findMany({ include: { environments: true, components: true, releases: true } });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Projects</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{project.description}</p>
              <p>Repo: {project.repoLink || "-"}</p>
              <p>Environments: {project.environments.map((e: any) => `${e.name} (${e.url || "n/a"})`).join(", ")}</p>
              <p>Components: {project.components.map((c: any) => c.name).join(", ")}</p>
              <p>Releases: {project.releases.map((r: any) => `${r.name}/${r.build}`).join(", ")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
