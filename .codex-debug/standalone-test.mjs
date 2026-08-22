import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const playwright = await import(
  "file:///C:/Users/admin/AppData/Local/OpenAI/Codex/runtimes/cua_node/1cb4becc994cbb02/bin/node_modules/playwright/index.mjs"
);

const fixturePath =
  "C:/Users/admin/Documents/ChatGPT/Tapd复制坐标/.codex-debug/bug/detail/1120421949162222181.html";
const scriptPath =
  "C:/Users/admin/Documents/ChatGPT/Tapd复制坐标/tapd-coordinate-copy.user.js";

const pageUrl = pathToFileURL(fixturePath).href;
const scriptSource = await readFile(scriptPath, "utf8");

const out = { steps: [], consoleErrors: [], pageErrors: [] };

const browser = await playwright.chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    out.consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => {
  out.pageErrors.push(String(err));
});

await page.goto(pageUrl);
out.steps.push({ step: "goto", ok: true, url: pageUrl });

const result = await page.evaluate(async (source) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = { injected: false, panelState: null, tests: {} };

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
      (n) =>
        n.style &&
        (n.style.outline || "").includes("255, 152, 0"),
    );
    report.tests.rowJump = {
      beforeY,
      afterY: window.scrollY,
      scrolled: Math.abs(window.scrollY - beforeY) > 50,
      flashedTag: flashed ? flashed.tagName : null,
      flashedId: flashed ? flashed.id || null : null,
      flashedClass: flashed ? flashed.className || null : null,
      flashedOutline: flashed ? flashed.style.outline : null,
    };
  }

  // 测试 3：点击第二行（页面中部坐标），验证滚动 + 高亮
  let midRow = null;
  for (const r of panel.querySelectorAll(".tcp-row")) {
    if ((r.innerText || "").includes("100.5")) {
      midRow = r;
      break;
    }
  }
  if (midRow) {
    const beforeY = window.scrollY;
    midRow.click();
    await sleep(1600);
    const flashed = Array.from(document.querySelectorAll("*")).find(
      (n) =>
        n.style &&
        (n.style.outline || "").includes("255, 152, 0"),
    );
    report.tests.midJump = {
      rowFound: true,
      beforeY,
      afterY: window.scrollY,
      scrolled: Math.abs(window.scrollY - beforeY) > 50,
      flashedTag: flashed ? flashed.tagName : null,
      flashedId: flashed ? flashed.id || null : null,
      flashedOutline: flashed ? flashed.style.outline : null,
    };
  } else {
    report.tests.midJump = { rowFound: false };
  }

  // 测试 4：点击 iframe 坐标行
  let frameRow = null;
  for (const r of panel.querySelectorAll(".tcp-row")) {
    if ((r.innerText || "").includes("88.8")) {
      frameRow = r;
      break;
    }
  }
  if (frameRow) {
    frameRow.click();
    await sleep(1600);
    const editor = document.getElementById("editor");
    let innerFlashed = null;
    try {
      const inner = editor.contentDocument;
      if (inner) {
        innerFlashed = Array.from(inner.querySelectorAll("*")).find(
          (n) =>
            n.style &&
            (n.style.outline || "").includes("255, 152, 0"),
        );
      }
    } catch (_) {}
    report.tests.frameJump = {
      rowFound: true,
      editorOutline: editor ? editor.style.outline : null,
      innerFlashedTag: innerFlashed ? innerFlashed.tagName : null,
      innerFlashedOutline: innerFlashed ? innerFlashed.style.outline : null,
    };
  } else {
    report.tests.frameJump = { rowFound: false };
  }

  // 测试 5：复制按钮的“已复制”反馈
  const copyBtn = panel.querySelector(".tcp-row .tcp-value");
  if (copyBtn) {
    const old = copyBtn.textContent;
    copyBtn.click();
    await sleep(100);
    const feedback = copyBtn.textContent;
    await sleep(900);
    report.tests.copyFeedback = {
      before: old,
      during: feedback,
      afterRestore: copyBtn.textContent,
    };
  }

  return report;
}, scriptSource);

out.steps.push({ step: "scriptTest", result });

await page.screenshot({
  path: "C:/Users/admin/AppData/Local/Temp/tapd-local-test-panel.png",
});
out.steps.push({ step: "screenshot", ok: true });

await browser.close();
out.steps.push({ step: "closed", ok: true });

console.log(JSON.stringify(out, null, 2));
