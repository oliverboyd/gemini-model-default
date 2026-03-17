const SKIP_PATHS = ['/gems/edit', '/gems/create', '/settings', '/extensions'];
const KNOWN_MODELS = ['pro', 'fast', 'thinking'];
const POLL_INTERVAL = 1500;
const MENU_RENDER_DELAY = 400;
const TURN_SELECTORS = 'model-response, user-query, .conversation-turn, [data-message-id]';

let isEnforcing = false;
let switchFailed = false;
let userInteracting = false;
let trackedBtn = null;
let lastTurnCount = 0;
let preferredModel = 'pro';
let showToast = false;
let targetModel = preferredModel;

chrome.storage.sync.get({ preferredModel: 'pro', showToast: false }, (data) => {
  preferredModel = data.preferredModel;
  showToast = data.showToast;
  targetModel = preferredModel;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.preferredModel) {
    preferredModel = changes.preferredModel.newValue;
    targetModel = preferredModel;
    switchFailed = false;
    userInteracting = false;
  }
  if (changes.showToast) showToast = changes.showToast.newValue;
});

const showNotification = (msg) => {
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: '99999',
    background: '#1a73e8', color: '#fff', padding: '10px 18px',
    borderRadius: '8px', fontSize: '14px', fontFamily: 'sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)', opacity: '0', transition: 'opacity 0.3s',
  });
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = '1'));
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
};

const shouldSkip = () => SKIP_PATHS.some((p) => location.pathname.startsWith(p));

const parseModel = (text) => KNOWN_MODELS.find((m) => text.trim().toLowerCase().includes(m)) ?? null;

// Track user clicks on the model button to detect manual switches
const trackButton = (btn) => {
  if (btn === trackedBtn) return;
  trackedBtn = btn;
  btn.addEventListener('click', () => {
    if (!isEnforcing) userInteracting = true;
  }, true);
};

// Resolve user interaction once the menu closes — adopt whatever they picked
const resolveUserInteraction = () => {
  if (!userInteracting) return;
  if (document.querySelector('.mat-mdc-menu-panel')) return; // menu still open
  const btn = document.querySelector('button.input-area-switch');
  if (!btn) return;
  const picked = parseModel(btn.textContent);
  if (picked) targetModel = picked;
  switchFailed = false;
  userInteracting = false;
};

// Prevent focus from leaving the active element during enforcement
const lockFocus = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return () => {};
  const handler = () => el.focus();
  el.addEventListener('focusout', handler);
  return () => el.removeEventListener('focusout', handler);
};

const VERIFY_DELAY = 300;

const dismissMenu = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

const openMenuAndSelect = async (btn, modelId) => {
  btn.click();
  await new Promise((r) => setTimeout(r, MENU_RENDER_DELAY));

  const panel = document.querySelector('.mat-mdc-menu-panel');
  if (!panel) return false;

  const items = panel.querySelectorAll('button.mat-mdc-menu-item, [role="menuitem"]');
  const texts = [...items].map((el) => el.textContent.trim().toLowerCase());
  const knownCount = texts.filter((t) => KNOWN_MODELS.some((m) => t.startsWith(m))).length;
  if (knownCount < 2) { dismissMenu(); return false; }

  const target = [...items].find((el) => el.textContent.trim().toLowerCase().startsWith(modelId));
  if (!target) { dismissMenu(); return false; }

  target.click();
  await new Promise((r) => setTimeout(r, VERIFY_DELAY));

  const newText = btn.textContent.trim().toLowerCase();
  return newText.includes(modelId);
};

const enforceModel = async () => {
  if (isEnforcing || shouldSkip() || switchFailed || userInteracting) return;
  isEnforcing = true;

  try {
    const btn = document.querySelector('button.input-area-switch');
    if (!btn) return;

    trackButton(btn);

    const btnText = btn.textContent.trim().toLowerCase();
    if (btnText.includes(targetModel)) return;

    const unlockFocus = lockFocus();

    // Hide menu during switch so it's not visible to user
    const hide = document.createElement('style');
    hide.id = 'gemini-ext-hide';
    hide.textContent = '.cdk-overlay-container { visibility: hidden !important; pointer-events: none !important; }';
    document.head.appendChild(hide);

    try {
      const switched = await openMenuAndSelect(btn, targetModel);
      if (switched) {
        if (showToast) {
          const name = targetModel.charAt(0).toUpperCase() + targetModel.slice(1);
          showNotification(`Switched to ${name}`);
        }
        return;
      }

      // Switch failed (e.g. rate-limited) — accept whatever Gemini has, retry on next navigation
      const current = parseModel(btn.textContent);
      if (current) targetModel = current;
      switchFailed = true;
      if (showToast) {
        const name = targetModel.charAt(0).toUpperCase() + targetModel.slice(1);
        showNotification(`${preferredModel.charAt(0).toUpperCase() + preferredModel.slice(1)} unavailable — using ${name}`);
      }
    } finally {
      document.getElementById('gemini-ext-hide')?.remove();
      unlockFocus();
    }
  } finally {
    isEnforcing = false;
  }
};

// Detect new conversation turns — resets switchFailed so enforcement can retry
const checkForNewTurns = () => {
  const turns = document.querySelectorAll(TURN_SELECTORS);
  const count = turns.length;
  if (count > lastTurnCount && lastTurnCount > 0) switchFailed = false;
  if (count > 0) lastTurnCount = count;
};

setInterval(() => {
  resolveUserInteraction();
  checkForNewTurns();
  enforceModel();
}, POLL_INTERVAL);

// Re-check on SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    targetModel = preferredModel;
    switchFailed = false;
    userInteracting = false;
    lastTurnCount = 0;
    enforceModel();
  }
}).observe(document.body, { childList: true, subtree: true });
