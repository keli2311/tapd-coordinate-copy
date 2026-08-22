await (async () => {
  if (globalThis.agent?.browsers == null) {
    const { setupBrowserRuntime } = await import(
      "file:///C:/Users/admin/.codex/plugins/cache/openai-bundled/chrome/26.810.52044/scripts/browser-client.mjs"
    );
    globalThis.agent = await setupBrowserRuntime();
  }
  const out = {};
  try {
    const browsers = await globalThis.agent.browsers.list();
    out.browsers = browsers.map((b) => ({ id: b.id, type: b.type, family: b.family }));
    const match = browsers.find(
      (b) => b.metadata?.extensionInstanceId === "96269f9c-6ac7-4a0f-a04d-f4f9dd82a973",
    );
    globalThis.chrome = await globalThis.agent.browsers.get(match.id);
    out.browserId = globalThis.chrome.browserId;
    const openTabs = await globalThis.chrome.user.openTabs();
    out.openTabs = openTabs.map((t) => ({ id: t.id, title: t.title, url: t.url }));
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e);
  }
  nodeRepl.write(JSON.stringify(out, null, 2));
})();
