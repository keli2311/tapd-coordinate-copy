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
  await globalThis.chrome.nameSession("🐞 TAPD v1.3.4 面板检查");
  const openTabs = await globalThis.chrome.user.openTabs();
  const exactTab = openTabs.find(
    (t) =>
      t.providerTabId === mention.tabId &&
      t.title === mention.title &&
      t.url === mention.url,
  );
  const tab = await globalThis.chrome.user.claimTab(exactTab);
  out.steps.push({ step: "claim", ok: true, id: tab.id });

  const probe = `() => {
    const panel = document.getElementById("tapd-coordinate-panel");
    return {
      readyState: document.readyState,
      panelPresent: !!panel,
      rows: panel ? panel.querySelectorAll(".tcp-row").length : 0,
      hint: panel ? (panel.querySelector(".tcp-hint")?.textContent || "") : null,
    };
  }`;

  for (let i = 0; i < 5; i += 1) {
    try {
      const data = await tab.playwright.evaluate(probe);
      out.steps.push({ step: `probe${i}`, ok: true, data });
      if (data.panelPresent) break;
    } catch (e) {
      out.steps.push({ step: `probe${i}`, ok: false, error: String(e) });
      break;
    }
    if (i < 4) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  nodeRepl.write(JSON.stringify(out, null, 2));
})();
