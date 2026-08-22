if (globalThis.agent?.browsers == null) {
  const { setupBrowserRuntime } = await import(
    "file:///C:/Users/admin/.codex/plugins/cache/openai-bundled/chrome/26.810.52044/scripts/browser-client.mjs"
  );
  globalThis.agent = await setupBrowserRuntime();
}
if (globalThis.chrome == null) {
  globalThis.chrome = await globalThis.agent.browsers.get("chrome");
}
await globalThis.chrome.nameSession("🧪 TAPD v1.3.4 脚本本地测试");

const out = { steps: [] };

const { pathToFileURL } = await import("node:url");
const { readFile } = await import("node:fs/promises");
const pageUrl = pathToFileURL(
  "C:/Users/admin/Documents/ChatGPT/Tapd复制坐标/.codex-debug/bug/detail/1120421949162222181.html",
).href;
const scriptSource = await readFile(
  "C:/Users/admin/Documents/ChatGPT/Tapd复制坐标/tapd-coordinate-copy.user.js",
  "utf8",
);

let tab = null;
try {
  tab = await globalThis.chrome.tabs.new();
  out.steps.push({ step: "newTab", ok: true, id: tab.id });
  await tab.goto(pageUrl);
  out.steps.push({ step: "goto", ok: true, url: pageUrl });
  await tab.playwright.waitForLoadState({
    state: "domcontentloaded",
    timeoutMs: 30000,
  });
} catch (e) {
  out.steps.push({ step: "openPage", ok: false, error: String(e) });
}

if (tab) {
  try {
    const result = await tab.playwright.evaluate(async (source) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const report = { injected: false, panelState: null, tests: {} };

      // 注入 GM 桩，然后加载用户脚本
      window.__copied = null;
      window.GM_setClipboard = (value) => {
        window.__copied = value;
      };
      window.GM_addStyle = (css) => {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
        return s;
      };
      const el = document.createElement("script");
      el.textContent = source;
      document.head.appendChild(el);
      report.injected = true;

      // 等待面板出现（脚本在加载时立即 createPanel + 多次延迟重扫）
      for (let i = 0; i < 30; i += 1) {
        if (document.getElementById("tapd-coordinate-panel")) break;
        await sleep(200);
      }
      const panel = document.getElementById("tapd-coordinate-panel");
      if (!panel) {
        report.panelState = { present: false };
        return report;
      }
      report.panelState = {
        present: true,
        rows: panel.querySelectorAll(".tcp-row").length,
        bodyText: panel.querySelector(".tcp-body")?.innerText || "",
        hint: panel.querySelector(".tcp-hint")?.textContent || "",
      };

      // 等待 iframe 重扫完成（脚本 500/1500/3000/6000ms 重扫）
      await sleep(3500);
      report.panelState.rowsAfterRescan = panel.querySelectorAll(".tcp-row").length;
      report.panelState.bodyTextAfterRescan =
        panel.querySelector(".tcp-body")?.innerText || "";

      // 测试 1：点击第一行 X 复制按钮
      const firstX = panel.querySelector(".tcp-row .tcp-value");
      if (firstX) {
        report.tests.firstXLabel = firstX.textContent;
        firstX.click();
        await sleep(150);
        report.tests.firstXCopied = window.__copied;
      }

      // 测试 2：点击第一行，验证滚动 + 高亮
      const firstRow = panel.querySelector(".tcp-row");
      if (firstRow) {
        const beforeY = window.scrollY;
        firstRow.click();
        await sleep(1600);
        const flashed = Array.from(document.querySelectorAll("*")).find(
          (n) => n.style && n.style.outline === "3px solid rgb(255, 152, 0)",
        );
        report.tests.rowJump = {
          beforeY,
          afterY: window.scrollY,
          scrolled: Math.abs(window.scrollY - beforeY) > 50,
          flashedTag: flashed ? flashed.tagName : null,
          flashedId: flashed ? flashed.id || null : null,
        };
      }

      // 测试 3：点击 iframe 坐标行（若出现），验证 iframe 内定位
      const rows = panel.querySelectorAll(".tcp-row");
      let frameRow = null;
      for (const r of rows) {
        if ((r.innerText || "").includes("88.8")) {
          frameRow = r;
          break;
        }
      }
      if (frameRow) {
        frameRow.click();
        await sleep(1600);
        const editor = document.getElementById("editor");
        report.tests.frameJump = {
          rowFound: true,
          editorOutline: editor ? editor.style.outline : null,
        };
      } else {
        report.tests.frameJump = { rowFound: false };
      }

      return report;
    }, scriptSource);
    out.steps.push({ step: "scriptTest", ok: true, result });
  } catch (e3) {
    out.steps.push({ step: "scriptTest", ok: false, error: String(e3) });
  }

  try {
    const logs = await tab.dev.logs({ levels: ["error", "warn"], limit: 40 });
    out.steps.push({ step: "consoleLogs", logs });
  } catch (e4) {
    out.steps.push({ step: "consoleLogs", ok: false, error: String(e4) });
  }
}

nodeRepl.write(JSON.stringify(out, null, 2));
