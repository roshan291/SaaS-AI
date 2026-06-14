// scripts/free-dev-ports.mjs
//
// Pre-step for `npm run dev`. Kills any process holding our dev ports
// (3000 web, 3001 web fallback, 4000 api) so a previous `turbo run dev`
// that exited without cleaning up its children doesn't block the next run.
//
// Cross-platform: uses `netstat` on Windows and `lsof` on macOS/Linux.

import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const PORTS = [3000, 3001, 4000];
const isWin = platform() === "win32";

function pidsOnPort(port) {
  try {
    if (isWin) {
      // `netstat -ano` columns: Proto, LocalAddr, ForeignAddr, State, PID
      const out = execFileSync("netstat", ["-ano"], {
        encoding: "utf8",
        windowsHide: true
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        // match lines where local address ends with :PORT and state is LISTENING
        const m = line.match(
          /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/
        );
        if (m && Number(m[1]) === port) pids.add(Number(m[2]));
      }
      return [...pids];
    }
    const out = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8"
    });
    return out.split(/\s+/).filter(Boolean).map(Number);
  } catch {
    // No listener / lsof not installed — treat as empty.
    return [];
  }
}

function kill(pid) {
  try {
    if (isWin) {
      execFileSync("taskkill", ["/PID", String(pid), "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
    } else {
      process.kill(pid, "SIGKILL");
    }
    console.log(`  killed PID ${pid}`);
  } catch (err) {
    console.warn(`  could not kill PID ${pid}: ${err.message}`);
  }
}

let total = 0;
for (const port of PORTS) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) continue;
  console.log(`port ${port} occupied by: ${pids.join(", ")}`);
  for (const pid of pids) {
    kill(pid);
    total++;
  }
}

if (total === 0) {
  console.log("dev ports clear");
}
