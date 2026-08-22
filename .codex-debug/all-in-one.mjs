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
  await globalThis.chrome.nameSession("🐞 TAPD v1.3.4 全流程测试");
  const openTabs = await globalThis.chrome.user.openTabs();
  const exactTab = openTabs.find(
    (t) =>
      t.providerTabId === mention.tabId &&
      t.title === mention.title &&
      t.url === mention.url,
  );
  out.steps.push({ step: "findTab", ok: !!exactTab });
  if (!exactTab) {
    nodeRepl.write(JSON.stringify(out, null, 2));
    return;
  }

  const tab = await globalThis.chrome.user.claimTab(exactTab);
  out.steps.push({ step: "claim", ok: true, id: tab.id });

  const panelProbe = `() => {
    const p = document.getElementById("tapd-coordinate-panel");
    return {
      readyState: document.readyState,
      present: !!p,
      rows: p ? p.querySelectorAll(".tcp-row").length : 0,
      hint: p ? (p.querySelector(".tcp-hint")?.textContent || "") : null,
    };
  }`;

  // 等待面板出现（最多约 12 秒，用内核侧等待避免页面计时器节流）
  let panelState = null;
  for (let i = 0; i < 5; i += 1) {
    panelState = await tab.playwright.evaluate(panelProbe);
    out.steps.push({ step: `probe${i}`, data: panelState });
    if (panelState.present) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (panelState && panelState.present) {
    // 面板信息
    const info = await tab.playwright.evaluate(`() => {
      const p = document.getElementById("tapd-coordinate-panel");
      return {
        bodyText: p.querySelector(".tcp-body")?.innerText || "",
        rows: p.querySelectorAll(".tcp-row").length,
        hint: p.querySelector(".tcp-hint")?.textContent || "",
      };
    }`);
    out.steps.push({ step: "panelInfo", ok: true, info });

    // 测试 1：点击第一个 X 复制按钮
    const copyResult = await tab.playwright.evaluate(`() => {
      const p = document.getElementById("tapd-coordinate-panel");
      const btn = p.querySelector(".tcp-row .tcp-value");
      if (!btn) return { clicked: false };
      const before = btn.textContent;
      btn.click();
      return { clicked: true, label: before, after: btn.textContent };
    }`);
    out.steps.push({ step: "copyClick", ok: true, copyResult });
    await new Promise((r) => setTimeout(r, 1200));
    const copyRestored = await tab.playwright.evaluate(`() => {
      const p = document.getElementById("tapd-coordinate-panel");
      const btn = p.querySelector(".tcp-row .tcp-value");
      return btn ? btn.textContent : null;
    }`);
    out.steps.push({ step: "copyRestored", text: copyRestored });

    // 测试 2：点击第一行定位
    const beforeRow1 = await tab.playwright.evaluate(`() => window.scrollY`);
    await tab.playwright.evaluate(`() => {
      const p = document.getElementById("tapd-coordinate-panel");
      p.querySelector(".tcp-row")?.click();
    }`);
    await new Promise((r) => setTimeout(r, 1800));
    const afterRow1 = await tab.playwright.evaluate(`() => ({
      scrollY: window.scrollY,
      iframeOutlines: Array.from(document.querySelectorAll("iframe")).map((f) => f.style.outline || ""),
    })`);
    out.steps.push({
      step: "row1Jump",
      beforeScrollY: beforeRow1,
      after: afterRow1,
      scrolled: Math.abs(afterRow1.scrollY - beforeRow1) > 50,
    });

    // 测试 3：点击第二行定位（若存在）
    const rowCount = await tab.playwright.evaluate(`() => {
      const p = document.getElementById("tapd-coordinate-panel");
      return p ? p.querySelectorAll(".tcp-row").length : 0;
    }`);
    if (rowCount > 1) {
      const beforeRow2 = await tab.playwright.evaluate(`() => window.scrollY`);
      await tab.playwright.evaluate(`() => {
        const p = document.getElementById("tapd-coordinate-panel");
        p.querySelectorAll(".tcp-row")[1]?.click();
      }`);
      await new Promise((r) => setTimeout(r, 1800));
      const afterRow2 = await tab.playwright.evaluate(`() => ({
        scrollY: window.scrollY,
        iframeOutlines: Array.from(document.querySelectorAll("iframe")).map((f) => f.style.outline || ""),
      })`);
      out.steps.push({
        step: "row2Jump",
        beforeScrollY: beforeRow2,
        after: afterRow2,
        scrolled: Math.abs(afterRow2.scrollY - beforeRow2) > 50,
      });
    }
  } else {
    out.steps.push({ step: "panelNeverAppeared", data: panelState });
  }

  // 控制台错误（仅 error，最多 10 条）
  try {
    const logs = await tab.dev.logs({ levels: ["error"], limit: 10 });
    out.steps.push({ step: "consoleErrors", logs });
  } catch (e) {
    out.steps.push({ step: "consoleErrors", ok: false, error: String(e) });
  }

  nodeRepl.write(JSON.stringify(out, null, 2));
})();
