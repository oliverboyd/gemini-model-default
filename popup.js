const MODELS = [
  { id: 'fast', name: 'Fast' },
  { id: 'thinking', name: 'Thinking' },
  { id: 'pro', name: 'Pro' },
];

const container = document.getElementById('options');
const fallbackContainer = document.getElementById('fallback-options');

let currentPreferred = 'pro';
let currentFallback = 'none';

const renderPreferred = (selected) => {
  currentPreferred = selected;
  container.innerHTML = '';
  for (const model of MODELS) {
    const opt = document.createElement('label');
    opt.className = `option${model.id === selected ? ' selected' : ''}`;
    opt.innerHTML = `
      <input type="radio" name="model" value="${model.id}" ${model.id === selected ? 'checked' : ''}>
      <span class="label-name">${model.name}</span>
    `;
    opt.querySelector('input').addEventListener('change', () => {
      chrome.storage.sync.set({ preferredModel: model.id });
      // Reset fallback if it conflicts with new preferred
      if (currentFallback === model.id) {
        currentFallback = 'none';
        chrome.storage.sync.set({ fallbackModel: 'none' });
      }
      renderPreferred(model.id);
      renderFallback(currentFallback);
    });
    container.appendChild(opt);
  }
};

const renderFallback = (selected) => {
  currentFallback = selected;
  fallbackContainer.innerHTML = '';

  const noneOpt = document.createElement('label');
  noneOpt.className = `option${selected === 'none' ? ' selected' : ''}`;
  noneOpt.innerHTML = `
    <input type="radio" name="fallback" value="none" ${selected === 'none' ? 'checked' : ''}>
    <span class="label-name">None</span>
    <span class="label-desc">no fallback</span>
  `;
  noneOpt.querySelector('input').addEventListener('change', () => {
    chrome.storage.sync.set({ fallbackModel: 'none' });
    renderFallback('none');
  });
  fallbackContainer.appendChild(noneOpt);

  for (const model of MODELS) {
    if (model.id === currentPreferred) continue;
    const opt = document.createElement('label');
    opt.className = `option${model.id === selected ? ' selected' : ''}`;
    opt.innerHTML = `
      <input type="radio" name="fallback" value="${model.id}" ${model.id === selected ? 'checked' : ''}>
      <span class="label-name">${model.name}</span>
    `;
    opt.querySelector('input').addEventListener('change', () => {
      chrome.storage.sync.set({ fallbackModel: model.id });
      renderFallback(model.id);
    });
    fallbackContainer.appendChild(opt);
  }
};

const toastCheckbox = document.getElementById('showToast');
toastCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ showToast: toastCheckbox.checked });
});

chrome.storage.sync.get({ preferredModel: 'pro', fallbackModel: 'none', showToast: false }, (data) => {
  renderPreferred(data.preferredModel);
  renderFallback(data.fallbackModel);
  toastCheckbox.checked = data.showToast;
});
