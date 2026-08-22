await (async () => {
  if (globalThis.agent?.browsers == null) {
    const { setupBrowserRuntime } = await import(
      "file:///C:/Users/admin/.codex/plugins/cache/openai-bundled/chrome/26.810.52044/scripts/browser-client.mjs"
    );
    globalThis.agent = await setupBrowserRuntime();
  }

  const out = { steps: [] };
  const mention = {
    browserId: "96269f9c-6ac7-4a0f-a04d-f4f9dd82a973",
    tabId: '["996bd3af-d386-4a16-8270-8488aa862ea2","722670928"]',
    title:
      "【CN】【PC】【必现】#浮空 森林 超高 弹药箱和收纳盒轻微浮空(X=359497.1,Y=-606519.9,Z=-22799.3)-DF-TAPD平台",
    url: "https://tapd.tencent.com/tapd_fe/20421949/bug/detail/1120421949162222181",
  };

  const browsers = await globalThis.agent.browsers.list();
  const match = browsers.find(
    (b) =>
      b.type === "extension" &&
      b.metadata?.extensionInstanceId === mention.browserId,
  );
  globalThis.chrome = await globalThis.agent.browsers.get(match.id);
  await globalThis.chrome.nameSession("🐞 TAPD v1.3.4 交互测试");
  const openTabs = await globalThis.chrome.user.openTabs();
  const exactTab = openTabs.find(
    (t) =>
      t.providerTabId === mention.tabId &&
      t.title === mention.title &&
      t.url === mention.url,
  );
  const tab = await globalThis.chrome.user.claimTab(exactTab);
  out.steps.push({ step: "claim", ok: true, id: tab.id });

  const flashScan = `(doc) => {
    const els = doc.querySelectorAll("*");
    for (const n of els) {
      if (n.style && (n.style.outline || "").includes("255, 152, 0")) {
        return {
          tag: n.tagName,
          id: n.id || null,
          cls: typeof n.className === "string" ? n.className : null,
          text: (n.innerText || n.textContent || "").slice(0, 60),
          outline: n.style.outline,
        };
      }
    }
    return null;
  }`;

  // 阶段 1：纯读取（无点击、无 sleep），验证 evaluate 正常
  try {
    const r = await tab.playwright.evaluate(
      `(scan) => {
        const panel = document.getElementById("tapd-coordinate-panel");
        return {
          ok: true,
          rows: panel ? panel.querySelectorAll(".tcp-row").length : 0,
          hasPanel: !!panel,
          scan: scan(document),
        };
      }`,
      flashScan,
    );
    out.steps.push({ step: "readOnly", ok: true, r });
  } catch (e) {
    out.steps.push({ step: "readOnly", ok: false, error: String(e) });
  }

  // 阶段 2：点击 X 复制按钮（无 sleep）
  try {
    const r = await tab.playwright.evaluate(
      `() => {
        const panel = document.getElementById("tapd-coordinate-panel");
        const firstX = panel.querySelector(".tcp-row .tcp-value");
        if (!firstX) return { clicked: false };
        const before = firstX.textContent;
        firstX.click();
        return { clicked: true, before, after: firstX.textContent };
      }`,
    );
    out.steps.push({ step: "clickX", ok: true, r });
  } catch (e) {
    out.steps.push({ step: "clickX", ok: false, error: String(e) });
  }

  // 阶段 3：点击第一行（无 sleep）
  try {
    const r = await tab.playwright.evaluate(
      `(scan) => {
        const panel = document.getElementById("tapd-coordinate-panel");
        const row = panel.querySelector(".tcp-row");
        if (!row) return { clicked: false };
        row.click();
        return { clicked: true, scrollY: window.scrollY, flashed: scan(document) };
      }`,
      flashScan,
    );
    out.steps.push({ step: "clickRow1", ok: true, r });
  } catch (e) {
    out.steps.push({ step: "clickRow1", ok: false, error: String(e) });
  }

  // 阶段 4：点击第二行（无 sleep）
  try {
    const r = await tab.playwright.evaluate(
      `(scan) => {
        const panel = document.getElementById("tapd-coordinate-panel");
        const rows = panel.querySelectorAll(".tcp-row");
        if (rows.length < 2) return { clicked: false };
        rows[1].click();
        return { clicked: true, scrollY: window.scrollY, flashed: scan(document) };
      }`,
      flashScan,
    );
    out.steps.push({ step: "clickRow2", ok: true, r });
  } catch (e) {
    out.steps.push({ step: "clickRow2", ok: false, error: String(e) });
  }

  nodeRepl.write(JSON.stringify(out, null, 2));
})();
