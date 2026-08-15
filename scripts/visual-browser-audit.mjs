// Auditoría opcional para un navegador Edge/Chromium con depuración remota.
const endpoint = process.env.HIDE_TOWN_CDP || "http://127.0.0.1:9223/json";
const targets = await fetch(endpoint).then((response) => response.json());
const page = targets.find((target) => target.type === "page" && target.url.startsWith("http://127.0.0.1:3000"));
if (!page) throw new Error("Abre http://127.0.0.1:3000 en un navegador con depuración remota en el puerto 9223.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const browserErrors = [];
const failedRequests = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text);
  if (message.method === "Network.loadingFailed" && !message.params.canceled) failedRequests.push(message.params.errorText);
  if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
    failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
  }
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await command("Runtime.enable");
await command("Page.enable");
await command("Network.enable");
await command("Performance.enable");
await command("Page.reload", { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 1600));
const resourceSummary = await evaluate(`(() => {
  const navigation = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');
  return {
    loadMilliseconds: Math.round(navigation?.loadEventEnd || 0),
    resourceCount: resources.length,
    transferredBytes: resources.reduce((total, item) => total + (item.transferSize || 0), 0),
    externalResources: resources.filter((item) => new URL(item.name).origin !== location.origin).map((item) => item.name)
  };
})()`);
const sizes = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]];
const screenIds = await evaluate("[...document.querySelectorAll('[data-screen]')].map((screen) => screen.id)");
const dialogIds = await evaluate("[...document.querySelectorAll('dialog')].map((dialog) => dialog.id)");
const results = [];

for (const [width, height] of sizes) {
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  for (const screenId of screenIds) {
    const measurement = await evaluate(`(() => {
      document.querySelectorAll('[data-screen]').forEach((screen) => {
        const active = screen.id === ${JSON.stringify(screenId)};
        screen.hidden = !active;
        screen.classList.toggle('is-active', active);
      });
      const screen = document.getElementById(${JSON.stringify(screenId)});
      const rect = screen.getBoundingClientRect();
      const visibleControls = [...screen.querySelectorAll('button:not([hidden]), input:not([hidden]), textarea:not([hidden]), a:not([hidden])')]
        .filter((control) => getComputedStyle(control).display !== 'none')
        .map((control) => ({ id: control.id || control.textContent.trim().slice(0, 24), rect: control.getBoundingClientRect().toJSON() }));
      const tooWide = [...screen.querySelectorAll('*')].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
      }).slice(0, 6).map((node) => node.id || node.className || node.tagName);
      return {
        viewport: [innerWidth, innerHeight],
        documentWidth: document.documentElement.scrollWidth,
        screen: { left: rect.left, right: rect.right, width: rect.width },
        tooWide,
        controlsBelowViewport: visibleControls.filter(({ rect: box }) => box.top >= innerHeight).length,
        canScrollToControls: screen.scrollHeight <= screen.clientHeight || getComputedStyle(document.body).overflowY !== 'hidden'
      };
    })()`);
    results.push({ size: `${width}x${height}`, screenId, ...measurement });
  }
  for (const dialogId of dialogIds) {
    const measurement = await evaluate(`(() => {
      const dialog = document.getElementById(${JSON.stringify(dialogId)});
      dialog.showModal();
      const rect = dialog.getBoundingClientRect();
      const valid = rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && dialog.scrollHeight <= innerHeight;
      dialog.close();
      return { valid, rect: rect.toJSON() };
    })()`);
    results.push({ size: `${width}x${height}`, screenId: `dialog:${dialogId}`, viewport: [width, height], documentWidth: width, tooWide: measurement.valid ? [] : [dialogId], canScrollToControls: true });
  }
}

await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const reducedMotion = await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches && getComputedStyle(document.querySelector('.mist')).animationName === 'none'");
const keyboardFocus = await evaluate("(() => { document.querySelectorAll('[data-screen]').forEach((screen) => { screen.hidden = screen.id !== 'menu'; }); const control = document.querySelector('#menu button'); control.focus(); return document.activeElement === control && control.matches(':focus-visible'); })()");
const audioStartsLocked = await evaluate("(() => { const manager = new AudioManager(); const locked = manager.context === null; manager.destroy(); return locked; })()");
const audioToggle = await evaluate("(() => { const key = 'el-pueblo-oculto:sound-muted'; const previous = localStorage.getItem(key); const manager = new AudioManager(); manager.setMuted(false, { userGesture: true }); const enabled = !manager.muted && manager.context !== null; manager.setMuted(true); const muted = manager.muted && localStorage.getItem(key) === 'true'; manager.destroy(); if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous); return enabled && muted; })()");
const accessibility = await evaluate(`(() => {
  const controls = [...document.querySelectorAll('button, input, textarea, a[href]')];
  const unlabeled = controls.filter((control) => {
    const label = control.labels?.[0]?.textContent || control.getAttribute('aria-label') || control.textContent || control.getAttribute('title');
    return !label?.trim();
  }).map((control) => control.id || control.tagName);
  return { controls: controls.length, unlabeled };
})()`);
await evaluate("document.getElementById('vote-dialog').showModal(); true");
await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await new Promise((resolve) => setTimeout(resolve, 50));
const dialogEscape = await evaluate("!document.getElementById('vote-dialog').open");
await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
const textZoom = await evaluate(`(() => {
  document.documentElement.style.fontSize = '200%';
  document.querySelectorAll('[data-screen]').forEach((screen) => { screen.hidden = screen.id !== 'menu'; });
  const valid = document.documentElement.scrollWidth <= innerWidth;
  document.documentElement.style.fontSize = '';
  return valid;
})()`);
const performanceMetrics = await command("Performance.getMetrics");
const metric = (name) => performanceMetrics.metrics.find((item) => item.name === name)?.value || 0;
const runtime = { jsHeapUsedBytes: Math.round(metric("JSHeapUsedSize")), domNodes: Math.round(metric("Nodes")), documents: Math.round(metric("Documents")) };

const failures = results.filter((item) => item.documentWidth > item.viewport[0] || item.tooWide.length > 0 || !item.canScrollToControls);
console.log(JSON.stringify({ resolutions: sizes.map((size) => size.join("x")), screens: screenIds.length, checks: results.length, failures, reducedMotion, keyboardFocus, dialogEscape, textZoom, accessibility, audioStartsLocked, audioToggle, resourceSummary, runtime, failedRequests, browserErrors }, null, 2));
socket.close();
if (failures.length || !reducedMotion || !keyboardFocus || !dialogEscape || !textZoom || accessibility.unlabeled.length || !audioStartsLocked || !audioToggle || resourceSummary.externalResources.length || failedRequests.length || browserErrors.length) process.exitCode = 1;
