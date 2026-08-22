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
  const openTabs = await globalThis.chrome.user.openTabs();
  const exactTab = openTabs.find(
    (t) =>
      t.providerTabId === mention.tabId &&
      t.title === mention.title &&
      t.url === mention.url,
  );
  const tab = await globalThis.chrome.user.claimTab(exactTab);
  out.steps.push({ step: "claim", ok: true, id: tab.id });

  try {
    const u = await tab.url();
    out.steps.push({ step: "url", ok: true, url: u });
  } catch (e) {
    out.steps.push({ step: "url", ok: false, error: String(e) });
  }
  try {
    const t = await tab.title();
    out.steps.push({ step: "title", ok: true, title: t });
  } catch (e) {
    out.steps.push({ step: "title", ok: false, error: String(e) });
  }
  try {
    const dlg = await tab.getJsDialog();
    out.steps.push({ step: "dialog", ok: true, dialog: dlg ? { type: dlg.type } : null });
  } catch (e) {
    out.steps.push({ step: "dialog", ok: false, error: String(e) });
  }

  nodeRepl.write(JSON.stringify(out, null, 2));
})();
