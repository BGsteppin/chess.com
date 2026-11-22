// language: javascript | runtime: extension popup | target: chrome.storage.local
const DEFAULTS = {
  mode: 'manual',
  depth: 15,
  skill: 20,
  elo: 1800,
  useElo: true,
};

const fields = ['mode', 'depth', 'useElo', 'elo', 'skill'];

function load() {
  chrome.storage.local.get(DEFAULTS, (res) => {
    const s = { ...DEFAULTS, ...res };
    document.getElementById('mode').value = s.mode;
    document.getElementById('depth').value = s.depth;
    document.getElementById('useElo').checked = !!s.useElo;
    document.getElementById('elo').value = s.elo;
    document.getElementById('skill').value = s.skill;
  });
}

function save() {
  const payload = {
    mode: document.getElementById('mode').value,
    depth: parseInt(document.getElementById('depth').value, 10) || 15,
    useElo: document.getElementById('useElo').checked,
    elo: parseInt(document.getElementById('elo').value, 10) || 1800,
    skill: parseInt(document.getElementById('skill').value, 10),
  };
  chrome.storage.local.set(payload);
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  for (const id of fields) {
    document.getElementById(id).addEventListener('change', save);
    document.getElementById(id).addEventListener('input', save);
  }
});
