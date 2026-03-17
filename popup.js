const MODELS = [
  { id: 'fast', name: 'Fast' },
  { id: 'thinking', name: 'Thinking' },
  { id: 'pro', name: 'Pro' },
];

const container = document.getElementById('options');

const render = (selected) => {
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
      render(model.id);
    });
    container.appendChild(opt);
  }
};

const toastCheckbox = document.getElementById('showToast');
toastCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ showToast: toastCheckbox.checked });
});

chrome.storage.sync.get({ preferredModel: 'pro', showToast: true }, (data) => {
  render(data.preferredModel);
  toastCheckbox.checked = data.showToast;
});
