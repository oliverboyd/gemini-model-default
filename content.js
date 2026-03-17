const SKIP_PATHS = ['/gems/edit', '/gems/create', '/settings', '/extensions'];
const KNOWN_MODELS = ['pro', 'fast', 'thinking'];
const POLL_INTERVAL = 1500;
const MENU_RENDER_DELAY = 400;
const TURN_SELECTORS = 'model-response, user-query, .conversation-turn, [data-message-id]';

let isEnforcing = false;
let userOverride = false;
let trackedBtn = null;
let lastTurnCount = 0;
let preferredModel = 'pro';
let fallbackModel = 'none';
let showToast = false;

chrome.storage.sync.get({ preferredModel: 'pro', fallbackModel: 'none', showToast: false }, (data) => {
  preferredModel = data.preferredModel;
  fallbackModel = data.fallbackModel;
  showToast = data.showToast;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.preferredModel) preferredModel = changes.preferredModel.newValue;
  if (changes.fallbackModel) fallbackModel = changes.fallbackModel.newValue;
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

// Track user clicks on the model button to detect manual switches
const trackButton = (btn) => {
  if (btn === trackedBtn) return;
  trackedBtn = btn;
  btn.addEventListener('click', () => {
    if (!isEnforcing) userOverride = true;
  }, true);
};

const VERIFY_DELAY = 300;

const openMenuAndSelect = async (btn, modelId) => {
  btn.click();
  await new Promise((r) => setTimeout(r, MENU_RENDER_DELAY));

  const panel = document.querySelector('.mat-mdc-menu-panel');
  if (!panel) return false;

  const items = panel.querySelectorAll('button.mat-mdc-menu-item, [role="menuitem"]');
  const texts = [...items].map((el) => el.textContent.trim().toLowerCase());
  const knownCount = texts.filter((t) => KNOWN_MODELS.some((m) => t.startsWith(m))).length;
  if (knownCount < 2) return false;

  const target = [...items].find((el) => el.textContent.trim().toLowerCase().startsWith(modelId));
  if (!target) return false;

  target.click();
  await new Promise((r) => setTimeout(r, VERIFY_DELAY));

  const newText = btn.textContent.trim().toLowerCase();
  return newText.includes(modelId);
};

const enforcePro = async () => {
  if (isEnforcing || shouldSkip() || userOverride) return;
  isEnforcing = true;

  try {
    const btn = document.querySelector('button.input-area-switch');
    if (!btn) return;

    trackButton(btn);

    const btnText = btn.textContent.trim().toLowerCase();
    if (btnText.includes(preferredModel)) return;
    // Already on fallback model — don't fight it
    if (fallbackModel !== 'none' && btnText.includes(fallbackModel)) return;

    // Hide menu during switch so it's not visible to user
    const hide = document.createElement('style');
    hide.id = 'gemini-ext-hide';
    hide.textContent = '.cdk-overlay-container { visibility: hidden !important; }';
    document.head.appendChild(hide);

    try {
      const switched = await openMenuAndSelect(btn, preferredModel);
      if (switched) {
        if (showToast) {
          const name = preferredModel.charAt(0).toUpperCase() + preferredModel.slice(1);
          showNotification(`Switched to ${name}`);
        }
        return;
      }

      // Preferred model switch failed (rate limit) — try fallback
      if (fallbackModel !== 'none' && fallbackModel !== preferredModel) {
        const fbSwitched = await openMenuAndSelect(btn, fallbackModel);
        if (fbSwitched) {
          if (showToast) {
            const name = fallbackModel.charAt(0).toUpperCase() + fallbackModel.slice(1);
            showNotification(`${preferredModel.charAt(0).toUpperCase() + preferredModel.slice(1)} unavailable — switched to ${name}`);
          }
          return;
        }
      }

      // Both failed or no fallback configured — stop retrying until next trigger
      userOverride = true;
      if (showToast) showNotification('Model switch failed — pausing until next turn');
    } finally {
      document.getElementById('gemini-ext-hide')?.remove();
    }
  } finally {
    isEnforcing = false;
  }
};

// Detect new conversation turns — resets user override so model is re-enforced
const checkForNewTurns = () => {
  const turns = document.querySelectorAll(TURN_SELECTORS);
  const count = turns.length;
  if (count > lastTurnCount && lastTurnCount > 0) {
    userOverride = false;
    enforcePro();
  }
  if (count > 0) lastTurnCount = count;
};

setInterval(() => {
  checkForNewTurns();
  enforcePro();
}, POLL_INTERVAL);

// Re-check on SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    userOverride = false;
    lastTurnCount = 0;
    enforcePro();
  }
}).observe(document.body, { childList: true, subtree: true });
