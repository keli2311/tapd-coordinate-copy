await (async () => {
  if (globalThis.agent?.browsers == null) {
    const { setupBrowserRuntime } = await import(
      "file:///C:/Users/admin/.codex/plugins/cache/openai-bundled/chrome/26.810.52044/scripts/browser-client.mjs"
    );
    globalThis.agent = await setupBrowserRuntime();
  }

  const out = { steps: [] };

  // 解码用户提供的标签页引用
  const mention = {
    browserId: "96269f9c-6ac7-4a0f-a04d-f4f9dd82a973",
    tabId: '["996bd3af-d386-4a16-8270-8488aa862ea2","722670928"]',
    title:
      "【CN】【PC】【必现】#浮空 森林 超高 弹药箱和收纳盒轻微浮空(X=359497.1,Y=-606519.9,Z=-22799.3)-DF-TAPD平台",
    url: "https://tapd.tencent.com/tapd_fe/20421949/bug/detail/1120421949162222181",
  };

  // 1. 列出浏览器，按扩展实例 ID 精确匹配
  const browsers = await globalThis.agent.browsers.list();
  const match = browsers.find(
    (b) =>
      b.type === "extension" &&
      b.metadata?.extensionInstanceId === mention.browserId,
  );
  out.steps.push({
    step: "findBrowserByInstance",
    ok: !!match,
    matched: match
      ? { id: match.id, name: match.name, metadata: match.metadata }
      : null,
    all: browsers.map((b) => ({
      id: b.id,
      type: b.type,
      family: b.family,
      metadata: b.metadata,
    })),
  });

  let final = out;
  if (match) {
    globalThis.chrome = await globalThis.agent.browsers.get(match.id);
    await globalThis.chrome.nameSession("🐞 TAPD v1.3.4 页面调试");

    // 2. 列出用户标签页，找到与引用完全一致的那个
    const openTabs = await globalThis.chrome.user.openTabs();
    const exactTab = openTabs.find(
      (t) =>
        t.providerTabId === mention.tabId &&
        t.title === mention.title &&
        t.url === mention.url,
    );
    out.steps.push({
      step: "findExactTab",
      ok: !!exactTab,
      found: exactTab
        ? {
            id: exactTab.id,
            providerTabId: exactTab.providerTabId,
            title: exactTab.title,
            url: exactTab.url,
          }
        : null,
      openTabs: openTabs.map((t) => ({
        id: t.id,
        providerTabId: t.providerTabId,
        title: t.title,
        url: t.url,
      })),
    });

    if (exactTab) {
      // 3. 认领该标签页
      let tab;
      try {
        tab = await globalThis.chrome.user.claimTab(exactTab);
        out.steps.push({ step: "claimTab", ok: true, id: tab.id });
      } catch (e) {
        out.steps.push({ step: "claimTab", ok: false, error: String(e) });
      }

      if (tab) {
        // 4. 读取页面状态
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
              panelVisible: panel
                ? panel.offsetWidth > 0 && panel.offsetHeight > 0
                : false,
              rows: panel ? panel.querySelectorAll(".tcp-row").length : 0,
              bodyText,
              hint: panel
                ? panel.querySelector(".tcp-hint")?.textContent || ""
                : null,
              gmSetClipboard: typeof GM_setClipboard,
              gmAddStyle: typeof GM_addStyle,
            };
          });
          out.steps.push({ step: "pageInfo", ok: true, info });
        } catch (e3) {
          out.steps.push({ step: "pageInfo", ok: false, error: String(e3) });
        }

        // 5. 控制台错误
        try {
          const logs = await tab.dev.logs({ levels: ["error", "warn"], limit: 40 });
          out.steps.push({ step: "consoleLogs", logs });
        } catch (e4) {
          out.steps.push({ step: "consoleLogs", ok: false, error: String(e4) });
        }

        // 6. 截图
        try {
          const { writeFile } = await import("node:fs/promises");
          const png = await tab.screenshot({ fullPage: false });
          const shotPath =
            "C:/Users/admin/AppData/Local/Temp/tapd-real-page-debug.png";
          await writeFile(shotPath, png);
          out.steps.push({ step: "screenshot", ok: true, path: shotPath });
        } catch (e5) {
          out.steps.push({ step: "screenshot", ok: false, error: String(e5) });
        }
      }
    }
    final = out;
  }

  nodeRepl.write(JSON.stringify(final, null, 2));
})();
