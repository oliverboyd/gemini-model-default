const SKIP_PATHS = ['/gems/edit', '/gems/create', '/settings', '/extensions'];
const KNOWN_MODELS = ['pro', 'fast', 'thinking'];
const POLL_INTERVAL = 1500;
const MENU_RENDER_DELAY = 400;
const TURN_SELECTORS = 'model-response, user-query, .conversation-turn, [data-message-id]';

let isEnforcing = false;
let switchFailed = false;
let rateLimited = false;
let userInteracting = false;
let userChose = false;
let lastTurnCount = 0;
let preferredModel = 'pro';
let enabled = true;
let rememberAcrossConvos = false;
let showToast = false;
let targetModel = preferredModel;

chrome.storage.sync.get({ preferredModel: 'pro', enabled: true, rememberAcrossConvos: false, showToast: false, userChosenModel: null }, (data) => {
  preferredModel = data.preferredModel;
  enabled = data.enabled;
  rememberAcrossConvos = data.rememberAcrossConvos;
  showToast = data.showToast;
  if (data.rememberAcrossConvos && data.userChosenModel) {
    targetModel = data.userChosenModel;
    userChose = true;
  } else {
    targetModel = preferredModel;
  }
});
// Restore rate-limit state from storage (persists across page loads)
chrome.storage.local.get(['rateLimitedModel', 'rateLimitedUntil'], (data) => {
  console.debug('[GeminiExt] rate limit storage:', data);
  if (data.rateLimitedModel && data.rateLimitedUntil > Date.now()) {
    rateLimited = true;
    console.debug('[GeminiExt] rate limit restored, resets at', new Date(data.rateLimitedUntil).toLocaleString());
  } else if (data.rateLimitedModel) {
    chrome.storage.local.remove(['rateLimitedModel', 'rateLimitedUntil']);
    console.debug('[GeminiExt] rate limit expired, cleared');
  }
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.preferredModel) {
    preferredModel = changes.preferredModel.newValue;
    targetModel = preferredModel;
    switchFailed = false;
    rateLimited = false;
    chrome.storage.local.remove(['rateLimitedModel', 'rateLimitedUntil']);
    userInteracting = false;
    userChose = false;
    chrome.storage.sync.remove('userChosenModel');
  }
  if (changes.enabled) {
    enabled = changes.enabled.newValue;
    if (enabled) { switchFailed = false; rateLimited = false; chrome.storage.local.remove(['rateLimitedModel', 'rateLimitedUntil']); userInteracting = false; }
  }
  if (changes.rememberAcrossConvos) {
    rememberAcrossConvos = changes.rememberAcrossConvos.newValue;
    if (!rememberAcrossConvos) {
      userChose = false;
      targetModel = preferredModel;
      chrome.storage.sync.remove('userChosenModel');
    }
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

// Parse "Limit resets Mar 20, 2:32 AM" → timestamp
const parseResetTime = (text) => {
  const match = text.match(/limit resets?\s+(.+)/i);
  if (!match) return Date.now() + 6 * 60 * 60 * 1000; // fallback: 6 hours
  const parsed = Date.parse(match[1]);
  if (isNaN(parsed)) return Date.now() + 6 * 60 * 60 * 1000;
  // If parsed time is in the past (e.g. no year in string), it might be next year — but more likely it's today/tomorrow
  return parsed < Date.now() ? Date.now() + 60 * 60 * 1000 : parsed;
};

// Detect user clicks on the model button via delegation (survives re-renders)
document.addEventListener('click', (e) => {
  if (!isEnforcing && e.target.closest('button.input-area-switch')) userInteracting = true;
}, true);

// Resolve user interaction once the menu closes — adopt whatever they picked
const resolveUserInteraction = () => {
  if (!userInteracting) return;
  if (document.querySelector('.mat-mdc-menu-panel')) return; // menu still open
  const btn = document.querySelector('button.input-area-switch');
  if (!btn) { userInteracting = false; return; }
  const picked = parseModel(btn.textContent);
  if (!picked) { userInteracting = false; return; }
  targetModel = picked;
  userChose = true;
  if (rememberAcrossConvos) chrome.storage.sync.set({ userChosenModel: picked });
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

const dismissMenu = (panel) => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

const openMenuAndSelect = async (btn, modelId) => {
  btn.click();
  await new Promise((r) => setTimeout(r, MENU_RENDER_DELAY));

  const panel = document.querySelector('.mat-mdc-menu-panel');
  if (!panel) return false;

  const items = panel.querySelectorAll('button.mat-mdc-menu-item, [role="menuitem"]');
  const texts = [...items].map((el) => el.textContent.trim().toLowerCase());
  const knownCount = texts.filter((t) => KNOWN_MODELS.some((m) => t.startsWith(m))).length;
  if (knownCount < 2) { dismissMenu(panel); return false; }

  const target = [...items].find((el) => el.textContent.trim().toLowerCase().startsWith(modelId));
  if (!target) { dismissMenu(panel); return false; }

  // Don't click rate-limited/disabled items — just dismiss and bail
  const targetText = target.textContent.toLowerCase();
  if (target.disabled || target.getAttribute('aria-disabled') === 'true' || targetText.includes('limit')) {
    const resetTime = parseResetTime(targetText);
    console.debug('[GeminiExt] rate limit detected, resets at', new Date(resetTime).toLocaleString());
    rateLimited = true;
    chrome.storage.local.set({ rateLimitedModel: modelId, rateLimitedUntil: resetTime });
    dismissMenu(panel);
    return false;
  }

  console.debug('[GeminiExt] clicking target model:', modelId);
  target.click();
  await new Promise((r) => setTimeout(r, VERIFY_DELAY));

  const newText = btn.textContent.trim().toLowerCase();
  return newText.includes(modelId);
};

const enforceModel = async () => {
  if (!enabled || isEnforcing || shouldSkip() || switchFailed || rateLimited || userInteracting) {
    if (switchFailed || rateLimited) console.debug('[GeminiExt] enforcement skipped — switchFailed:', switchFailed, 'rateLimited:', rateLimited);
    return;
  }
  console.debug('[GeminiExt] enforcing model, target:', targetModel);
  isEnforcing = true;

  try {
    const btn = document.querySelector('button.input-area-switch');
    if (!btn) return;

    const btnText = btn.textContent.trim().toLowerCase();
    if (btnText.includes(targetModel)) return;

    const unlockFocus = lockFocus();

    // Hide menu during switch so it's not visible to user
    const hide = document.createElement('style');
    hide.id = 'gemini-ext-hide';
    hide.textContent = '.cdk-overlay-container, .cdk-overlay-pane, .mat-mdc-menu-panel { position: fixed !important; top: -99999px !important; left: -99999px !important; pointer-events: none !important; }';
    document.head.appendChild(hide);

    try {
      const switched = await openMenuAndSelect(btn, targetModel);
      console.debug('[GeminiExt] switch result:', switched, 'rateLimited:', rateLimited);
      // Only attempt once per navigation — if Gemini reverts (rate-limited), don't retry
      switchFailed = true;
      if (switched) {
        if (showToast) {
          const name = targetModel.charAt(0).toUpperCase() + targetModel.slice(1);
          showNotification(`Switched to ${name}`);
        }
        return;
      }

      // Switch failed (e.g. rate-limited) — dismiss menu before unhiding
      const leftover = document.querySelector('.mat-mdc-menu-panel');
      if (leftover) dismissMenu(leftover);
      await new Promise((r) => setTimeout(r, 200));

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

// Detect new conversation turns — resets target model but not switchFailed (rate limits persist within a session)
const checkForNewTurns = () => {
  const turns = document.querySelectorAll(TURN_SELECTORS);
  const count = turns.length;
  if (count > lastTurnCount && lastTurnCount > 0) {
    if (!userChose) targetModel = preferredModel;
  }
  if (count > 0) lastTurnCount = count;
};

const isContextValid = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

const pollId = setInterval(() => {
  if (!isContextValid()) { clearInterval(pollId); return; }
  if (!enabled) return;
  resolveUserInteraction();
  checkForNewTurns();
  enforceModel();
}, POLL_INTERVAL);

// Re-check on SPA navigation
const getConversationId = () => location.pathname.match(/\/app\/([^/?]+)/)?.[1] ?? null;
let lastUrl = location.href;
let lastConvId = getConversationId();
const observer = new MutationObserver(() => {
  if (!isContextValid()) { observer.disconnect(); return; }
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    const convId = getConversationId();
    const isNewConversation = lastConvId && convId !== lastConvId;
    lastConvId = convId;
    if (!userChose || (isNewConversation && !rememberAcrossConvos)) {
      targetModel = preferredModel;
      userChose = false;
      chrome.storage.sync.remove('userChosenModel');
    }
    if (isNewConversation) switchFailed = false;
    userInteracting = false;
    lastTurnCount = 0;
    enforceModel();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
