if (globalThis.agent?.browsers == null) {
  const { setupBrowserRuntime } = await import(
    "file:///C:/Users/admin/.codex/plugins/cache/openai-bundled/chrome/26.810.52044/scripts/browser-client.mjs"
  );
  globalThis.agent = await setupBrowserRuntime();
}
if (globalThis.chrome == null) {
  globalThis.chrome = await globalThis.agent.browsers.get("chrome");
}
await globalThis.chrome.nameSession("🐞 TAPD v1.3.4 脚本调试");

const out = { steps: [] };

const userTabs = await globalThis.chrome.user.openTabs();
const detailTab = userTabs.find((t) => t.url?.includes("1120421949162222181"));
out.steps.push({ step: "findUserTab", found: !!detailTab });

let tab = null;
try {
  tab = await globalThis.chrome.user.claimTab(detailTab);
  out.steps.push({ step: "claim", ok: true, id: tab.id });
} catch (e) {
  out.steps.push({ step: "claim", ok: false, error: String(e) });
  try {
    tab = await globalThis.chrome.tabs.new();
    out.steps.push({ step: "newTab", ok: true, id: tab.id });
    await tab.goto(
      "https://tapd.tencent.com/tapd_fe/20421949/bug/detail/1120421949162222181",
    );
    out.steps.push({ step: "goto", ok: true });
    await tab.playwright.waitForLoadState({
      state: "domcontentloaded",
      timeoutMs: 30000,
    });
  } catch (e2) {
    out.steps.push({ step: "newTab", ok: false, error: String(e2) });
  }
}

if (tab) {
  try {
    const info = await tab.playwright.evaluate(() => {
      const panel = document.getElementById("tapd-coordinate-panel");
      const bodyText = panel
        ? panel.querySelector(".tcp-body")?.innerText || ""
        : null;
      return {
        url: location.href,
        title: document.title,
        panelPresent: !!panel,
        panelVisible: panel ? panel.offsetWidth > 0 && panel.offsetHeight > 0 : false,
        rows: panel ? panel.querySelectorAll(".tcp-row").length : 0,
        bodyText,
        hint: panel ? panel.querySelector(".tcp-hint")?.textContent || "" : null,
        gmSetClipboard: typeof GM_setClipboard,
        gmAddStyle: typeof GM_addStyle,
        tampermonkeyScripts: Array.from(
          document.querySelectorAll("script"),
          (s) => s.src || "",
        ).filter((s) => s.includes("tampermonkey") || s.includes("userscripts")),
      };
    });
    out.steps.push({ step: "pageInfo", ok: true, info });
  } catch (e3) {
    out.steps.push({ step: "pageInfo", ok: false, error: String(e3) });
  }

  try {
    const logs = await tab.dev.logs({ levels: ["error", "warn"], limit: 40 });
    out.steps.push({ step: "consoleLogs", logs });
  } catch (e4) {
    out.steps.push({ step: "consoleLogs", ok: false, error: String(e4) });
  }

  try {
    const { writeFile } = await import("node:fs/promises");
    const png = await tab.screenshot({ fullPage: false });
    const shotPath = "C:/Users/admin/AppData/Local/Temp/tapd-debug-screenshot.png";
    await writeFile(shotPath, png);
    out.steps.push({ step: "screenshot", ok: true, path: shotPath });
  } catch (e5) {
    out.steps.push({ step: "screenshot", ok: false, error: String(e5) });
  }
}

nodeRepl.write(JSON.stringify(out, null, 2));
