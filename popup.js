const MODELS = [
  { id: 'fast', name: 'Fast' },
  { id: 'thinking', name: 'Thinking' },
  { id: 'pro', name: 'Pro' },
];

const container = document.getElementById('options');
const bodyContent = document.getElementById('body-content');
const enabledCheckbox = document.getElementById('enabled');
const rememberCheckbox = document.getElementById('rememberAcrossConvos');
const toastCheckbox = document.getElementById('showToast');

const renderPreferred = (selected) => {
  container.innerHTML = '';
  for (const model of MODELS) {
    const opt = document.createElement('label');
    opt.className = `option${model.id === selected ? ' selected' : ''}`;
    opt.innerHTML = `
      <input type="radio" name="model" value="${model.id}" ${model.id === selected ? 'checked' : ''}>
      <span class="radio-dot"></span>
      <span class="label-name">${model.name}</span>
    `;
    opt.querySelector('input').addEventListener('change', () => {
      chrome.storage.sync.set({ preferredModel: model.id });
      renderPreferred(model.id);
    });
    container.appendChild(opt);
  }
};

enabledCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledCheckbox.checked });
  bodyContent.classList.toggle('disabled', !enabledCheckbox.checked);
});

rememberCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ rememberAcrossConvos: rememberCheckbox.checked });
});

toastCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ showToast: toastCheckbox.checked });
});

chrome.storage.sync.get({ preferredModel: 'pro', enabled: true, rememberAcrossConvos: false, showToast: false }, (data) => {
  renderPreferred(data.preferredModel);
  enabledCheckbox.checked = data.enabled;
  rememberCheckbox.checked = data.rememberAcrossConvos;
  toastCheckbox.checked = data.showToast;
  bodyContent.classList.toggle('disabled', !data.enabled);
});
