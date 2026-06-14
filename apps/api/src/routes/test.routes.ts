import { Router } from "express";

import { AuthService } from "../auth/auth-service";
import { asyncHandler } from "../lib/async-handler";
import { respond } from "../lib/respond";

const router = Router();
const authService = new AuthService();

// One-shot bootstrap helper. Generates a random workspace + owner so you can
// click "Authorize" in /api/docs and try every endpoint in seconds. Disabled
// outside development for safety.
router.post(
  "/seed",
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({
        success: false,
        code: "DISABLED_IN_PRODUCTION",
        message: "Test seed is disabled in production"
      });
      return;
    }

    const stamp = Date.now().toString(36);
    const result = await authService.registerOwner({
      firstName: "Demo",
      lastName: "Owner",
      email: `demo-${stamp}@example.test`,
      password: "DemoSeedP@ssw0rd!",
      workspace: {
        name: `Demo Workspace ${stamp}`,
        slug: `demo-${stamp}`
      }
    });

    respond(
      res,
      {
        ...result,
        hint:
          "Copy the `token` above, click 'Authorize' at the top of /api/docs, " +
          "paste it, then every secured endpoint is callable via 'Try it out'."
      },
      201
    );
  })
);

// Returns ready-to-paste request bodies for every write endpoint. Useful when
// you want to script tests without thinking about validation rules.
router.get(
  "/sample-payloads",
  asyncHandler(async (_req, res) => {
    respond(res, {
      auth: {
        register: {
          firstName: "Acme",
          lastName: "Owner",
          email: "owner-demo@acme.test",
          password: "StrongP@ssw0rd!",
          workspace: { name: "Acme Inc", slug: "acme-demo-001" }
        },
        login: { email: "owner-demo@acme.test", password: "StrongP@ssw0rd!" }
      },
      users: {
        create: {
          firstName: "Eve",
          lastName: "Editor",
          email: "eve-demo@acme.test",
          password: "AnotherP@ss123!",
          role: "editor"
        }
      },
      workspaces: {
        create: {
          name: "Side Project",
          slug: "side-project-001",
          settings: { timezone: "UTC", locale: "en-US" }
        }
      },
      posts: {
        create: {
          title: "Hello world",
          content: "This is the body of my first post.",
          status: "draft"
        },
        update: { title: "Hello world v2" }
      },
      ai: {
        generate: { topic: "Benefits of remote work" }
      },
      hashtags: {
        generate: { topic: "Remote work culture" }
      },
      images: {
        generate: { topic: "A serene mountain landscape at sunrise" }
      }
    });
  })
);

export default router;
