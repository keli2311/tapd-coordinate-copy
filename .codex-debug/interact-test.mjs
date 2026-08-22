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
  if (!match) {
    out.steps.push({ step: "findBrowser", ok: false });
    nodeRepl.write(JSON.stringify(out, null, 2));
    return;
  }
  globalThis.chrome = await globalThis.agent.browsers.get(match.id);
  await globalThis.chrome.nameSession("🐞 TAPD v1.3.4 交互测试");

  const openTabs = await globalThis.chrome.user.openTabs();
  const exactTab = openTabs.find(
    (t) =>
      t.providerTabId === mention.tabId &&
      t.title === mention.title &&
      t.url === mention.url,
  );
  if (!exactTab) {
    out.steps.push({ step: "findTab", ok: false });
    nodeRepl.write(JSON.stringify(out, null, 2));
    return;
  }

  const tab = await globalThis.chrome.user.claimTab(exactTab);
  out.steps.push({ step: "claim", ok: true, id: tab.id });

  // 交互测试
  try {
    const result = await tab.playwright.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const report = { tests: {} };
      const panel = document.getElementById("tapd-coordinate-panel");
      if (!panel) {
        report.tests.panelMissing = true;
        return report;
      }

      const allDocs = () => {
        const docs = [document];
        for (const f of document.querySelectorAll("iframe")) {
          try {
            const d = f.contentDocument;
            if (d) docs.push(d);
          } catch (_) {}
        }
        return docs;
      };
      const findFlashed = () => {
        for (const d of allDocs()) {
          const el = Array.from(d.querySelectorAll("*")).find(
            (n) => n.style && (n.style.outline || "").includes("255, 152, 0"),
          );
          if (el) {
            return {
              tag: el.tagName,
              id: el.id || null,
              cls: typeof el.className === "string" ? el.className : null,
              text: (el.innerText || el.textContent || "").slice(0, 80),
              inFrame: d !== document,
              outline: el.style.outline,
            };
          }
        }
        return null;
      };

      // 测试 1：点击第一行 X 复制按钮（按钮反馈）
      const firstX = panel.querySelector(".tcp-row .tcp-value");
      if (firstX) {
        const before = firstX.textContent;
        firstX.click();
        await sleep(120);
        report.tests.copyBtn = {
          label: before,
          during: firstX.textContent,
        };
        await sleep(900);
        report.tests.copyBtn.restored = firstX.textContent === before;
      }

      // 测试 2：点击第一行定位（标题坐标）
      const firstRow = panel.querySelector(".tcp-row");
      if (firstRow) {
        const beforeY = window.scrollY;
        firstRow.click();
        await sleep(1800);
        report.tests.row1Jump = {
          label: firstRow.querySelector(".tcp-source")?.innerText || "",
          beforeY,
          afterY: window.scrollY,
          scrolled: Math.abs(window.scrollY - beforeY) > 50,
          flashed: findFlashed(),
        };
      }

      // 测试 3：点击第二行定位（详情/iframe 坐标）
      const rows = panel.querySelectorAll(".tcp-row");
      if (rows.length > 1) {
        const row2 = rows[1];
        const beforeY = window.scrollY;
        row2.click();
        await sleep(1800);
        report.tests.row2Jump = {
          label: row2.querySelector(".tcp-source")?.innerText || "",
          beforeY,
          afterY: window.scrollY,
          scrolled: Math.abs(window.scrollY - beforeY) > 50,
          flashed: findFlashed(),
        };
      }

      return report;
    });
    out.steps.push({ step: "interact", ok: true, result });
  } catch (e) {
    out.steps.push({ step: "interact", ok: false, error: String(e) });
  }

  nodeRepl.write(JSON.stringify(out, null, 2));
})();
