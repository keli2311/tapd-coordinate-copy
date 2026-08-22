// Temporary bridge to the node_repl MCP stdio server (used only for browser work).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const nodeReplPath =
  "C:/Users/admin/AppData/Local/OpenAI/Codex/runtimes/cua_node/1cb4becc994cbb02/bin/node_repl.exe";

const sessionId =
  process.env.BRIDGE_SESSION_ID || "01a009b6-8d8c-76a1-96af-eb1f5af4f848";
const turnId =
  process.env.BRIDGE_TURN_ID || "01a009e0-8ffa-7c40-9ff4-9fcbcfe60e11";
const turnMeta = { session_id: sessionId, turn_id: turnId };
const requestMeta = JSON.stringify({ "x-codex-turn-metadata": turnMeta });

const child = spawn(nodeReplPath, [], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    NODE_REPL_REQUEST_META: requestMeta,
    BROWSER_USE_SECURITY_MODE: "disabled-for-local-testing",
  },
});

let buffer = "";
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
  });
}

function notify(method, params) {
  const msg = { jsonrpc: "2.0", method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
}

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", () => {});

child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed.id != null && pending.has(parsed.id)) {
      const p = pending.get(parsed.id);
      pending.delete(parsed.id);
      if (parsed.error) p.reject(new Error(JSON.stringify(parsed.error)));
      else p.resolve(parsed.result);
    }
  }
});

async function main() {
  const codeFile = process.argv[2];
  if (!codeFile) throw new Error("usage: node bridge.mjs <code-file>");
  const code = readFileSync(codeFile, "utf8");

  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "codex-bridge", version: "1.0.0" },
  });
  notify("notifications/initialized", {});

  const result = await send("tools/call", {
    name: "js",
    arguments: { code, title: "Debug TAPD page", timeout_ms: 120000 },
    _meta: { "x-codex-turn-metadata": turnMeta },
    meta: { "x-codex-turn-metadata": turnMeta },
  });
  console.log("CALL_RESULT=" + JSON.stringify(result));
  // 给内核一点时间完成回合收尾，再优雅关闭
  await new Promise((r) => setTimeout(r, 2500));
  child.stdin.end();
  await new Promise((r) => {
    const t = setTimeout(() => {
      child.kill();
      r();
    }, 8000);
    child.on("exit", () => {
      clearTimeout(t);
      r();
    });
  });
}

main()
  .catch((e) => {
    console.error("BRIDGE_ERROR: " + (e?.stack ?? e));
    child.kill();
    process.exit(1);
  })
  .finally(() => {
    setTimeout(() => process.exit(0), 200);
  });
