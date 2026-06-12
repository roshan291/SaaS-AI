import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

// Load the static OpenAPI YAML once at boot. We keep the spec in YAML rather
// than building it from code so that infra/docs reviewers can edit it without
// rebuilding the TypeScript app.
const SPEC_PATH = resolve(__dirname, "../docs/openapi.yaml");

let cachedSpec: unknown | null = null;
function loadSpec(): unknown {
  if (cachedSpec) return cachedSpec;
  const raw = readFileSync(SPEC_PATH, "utf8");
  cachedSpec = YAML.parse(raw);
  return cachedSpec;
}

export function mountSwagger(app: Express, basePath = "/api/docs"): void {
  const spec = loadSpec();
  app.get(`${basePath}.json`, (_req, res) => {
    res.json(spec);
  });
  app.use(
    basePath,
    swaggerUi.serve,
    swaggerUi.setup(spec as Record<string, unknown>, {
      customSiteTitle: "Social Media SaaS API Docs",
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        tryItOutEnabled: true
      }
    })
  );
}
