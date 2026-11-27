import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createGit } from "./git.ts";
import { createServer } from "./server.ts";
import { openWorkspace } from "./workspace.ts";

// D2: the root is the working directory of the entry, resolved once for the
// process and injected into every connection it serves.
const workspace = await openWorkspace(process.cwd());
const git = createGit(workspace);

// R10: stdio is the transport. The connection owns the process lifetime and the
// wire owns stdout, so out-of-band failures are reported on stderr and never
// interleaved with a protocol message.
serveStdio(() => createServer({ workspace, git }), {
  onerror: (error: Error) => {
    process.stderr.write(`refactor-report: ${error.message}\n`);
  },
});
