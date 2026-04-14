// ══════════════════════════════════════════
//  Claude Chat — app.js
// ══════════════════════════════════════════

// ── ESTADO
let convs         = [];
let currentId     = null;
let currentModel  = 'claude-sonnet-4-6';
let isGenerating  = false;
let stopRequested = false;

// ── UTILIDADES
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc  = s  => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const save = ()  => { try { localStorage.setItem('puter_convs', JSON.stringify(convs)); } catch(e) {} };
const load = ()  => { try { const r = localStorage.getItem('puter_convs'); if (r) convs = JSON.parse(r); } catch(e) { convs = []; } };

// ── CONFIGURAR MARKED
const renderer = new marked.Renderer();
renderer.code = (code, lang) => {
  const id  = 'c' + uid();
  const lbl = lang || 'código';
  return `<pre><div class="code-header">
    <span class="code-lang">${esc(lbl)}</span>
    <button class="code-copy" onclick="cpCode('${id}')">Copiar</button>
  </div><code id="${id}">${esc(code)}</code></pre>`;
};
marked.use({ renderer, breaks: true, gfm: true });

// ── DOM
const input     = document.getElementById('input');
const sendBtn   = document.getElementById('sendBtn');
const stopBtn   = document.getElementById('stopBtn');
const chatArea  = document.getElementById('chatArea');
const chatInner = document.getElementById('chatInner');
const convList  = document.getElementById('convList');
const modelBtn  = document.getElementById('modelBtn');
const modelDd   = document.getElementById('modelDropdown');
const modelLbl  = document.getElementById('modelLabel');
const themeBtn  = document.getElementById('themeBtn');
const iconMoon  = document.getElementById('iconMoon');
const iconSun   = document.getElementById('iconSun');

// ── DARK MODE
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch(e) {}
  if (theme === 'dark') {
    iconMoon.style.display = 'none';
    iconSun.style.display  = 'block';
    themeBtn.title = 'Cambiar a modo claro';
  } else {
    iconMoon.style.display = 'block';
    iconSun.style.display  = 'none';
    themeBtn.title = 'Cambiar a modo oscuro';
  }
}
(function(){
  const saved = localStorage.getItem('theme') || 'light';
  applyTheme(saved);
})();
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// ── TEXTAREA AUTO-HEIGHT
input.addEventListener('input', () => {
  sendBtn.disabled = !input.value.trim() || isGenerating;
  input.style.height = 'auto';
  input.style.height = Math.min(220, input.scrollHeight) + 'px';
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMsg();
  }
});

// ── SELECTOR DE MODELO
modelBtn.addEventListener('click', e => {
  e.stopPropagation();
  modelDd.classList.toggle('open');
});
document.addEventListener('click', () => modelDd.classList.remove('open'));
document.querySelectorAll('.model-item').forEach(el => {
  el.addEventListener('click', () => {
    currentModel = el.dataset.m;
    modelLbl.textContent = el.querySelector('.model-item-name').textContent;
    document.querySelectorAll('.model-item').forEach(i => i.classList.remove('sel'));
    el.classList.add('sel');
    modelDd.classList.remove('open');
  });
});

// ── SIDEBAR TOGGLE (móvil)
document.getElementById('sidebarToggle').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('open')
);

// ── MODAL CONFIRMACIÓN BORRAR ──────────────────────────
function confirmDelete(id, title) {
  // Quitar modal previo si existe
  const prev = document.getElementById('deleteModal');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'deleteModal';

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </div>
      <h3 id="modalTitle">¿Borrar conversación?</h3>
      <p>Se eliminará <span class="modal-title-preview">"${esc(title.slice(0, 50))}${title.length > 50 ? '…' : ''}"</span> y no podrás recuperarla.</p>
      <div class="modal-actions">
        <button class="btn-cancel" id="modalCancel">Cancelar</button>
        <button class="btn-delete" id="modalConfirm">Borrar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Foco en el botón cancelar por defecto
  setTimeout(() => document.getElementById('modalCancel').focus(), 50);

  // Cerrar al hacer clic en el fondo
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  // Cerrar con Escape
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  });

  document.getElementById('modalCancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modalConfirm').addEventListener('click', () => {
    overlay.remove();
    doDelete(id);
  });
}

function doDelete(id) {
  convs = convs.filter(c => c.id !== id);
  if (currentId === id) currentId = null;
  save();
  renderSidebar();
  renderChat();
}
// ───────────────────────────────────────────────────────

// ── NUEVA CONVERSACIÓN
function newChat() {
  const c = {
    id: uid(),
    title: 'Nueva conversación',
    model: currentModel,
    msgs: [],
    createdAt: new Date().toISOString()
  };
  convs.unshift(c);
  currentId = c.id;
  save();
  renderSidebar();
  renderChat();
}

// ── RENDERIZAR SIDEBAR
function renderSidebar() {
  if (!convs.length) {
    convList.innerHTML = `<div style="padding:16px 12px;font-size:12px;color:var(--text-faint);text-align:center;line-height:1.7">
      Tus conversaciones<br>aparecerán aquí
    </div>`;
    return;
  }
  convList.innerHTML = convs.map(c => `
    <div class="conv-item${c.id === currentId ? ' active' : ''}" onclick="loadConv('${c.id}')">
      <div class="conv-title">${esc(c.title)}</div>
      <button
        class="conv-del"
        title="Borrar conversación"
        aria-label="Borrar conversación"
        onclick="event.stopPropagation(); confirmDelete('${c.id}', '${c.title.replace(/'/g, "\\'")}')"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>`).join('');
}

function loadConv(id) {
  currentId = id;
  renderSidebar();
  renderChat();
  document.getElementById('sidebar').classList.remove('open');
}

// ── CHIP DE SUGERENCIA
window.useChip = btn => {
  input.value = btn.textContent;
  input.dispatchEvent(new Event('input'));
  input.focus();
};

// ── RENDERIZAR CHAT
function renderChat() {
  chatInner.innerHTML = '';
  if (!currentId) { showWelcome(); return; }
  const c = convs.find(x => x.id === currentId);
  if (!c || !c.msgs.length) { showWelcome(); return; }
  c.msgs.forEach(m => appendMsg(m.role, m.content, false));
  scrollBottom();
}

function showWelcome() {
  chatInner.innerHTML = `
    <div class="welcome">
      <div class="welcome-logo">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
          <path d="M12 3c-1.2 5.4-5 7.8-8 9 3 1.2 6.8 3.6 8 9 1.2-5.4 5-7.8 8-9-3-1.2-6.8-3.6-8-9z" fill="white" opacity=".9"/>
        </svg>
      </div>
      <h2>¿En qué puedo ayudarte?</h2>
      <p>Claude vía Puter.js — sin API key, gratis en el navegador.</p>
      <div class="chips">
        <button class="chip" onclick="useChip(this)">Explica POO en PHP con ejemplos prácticos</button>
        <button class="chip" onclick="useChip(this)">¿Cómo funciona AJAX con jQuery?</button>
        <button class="chip" onclick="useChip(this)">SOAP vs REST — ¿cuál usar en sistemas de salud?</button>
        <button class="chip" onclick="useChip(this)">Preguntas de entrevista técnica en PHP Junior</button>
        <button class="chip" onclick="useChip(this)">Crea un CRUD en PHP con PDO y PostgreSQL</button>
        <button class="chip" onclick="useChip(this)">¿Qué es un sistema experto? Explica con ejemplos</button>
      </div>
    </div>`;
}

// ── AGREGAR MENSAJE AL DOM
function appendMsg(role, content, streaming) {
  const isUser = role === 'user';
  const grp    = document.createElement('div');
  grp.className = 'msg-group';
  if (streaming) grp.id = 'stream-grp';

  grp.innerHTML = `
    <div class="msg-role">
      <div class="msg-avatar ${isUser ? 'user' : 'ai'}">${isUser ? 'LP' : 'C'}</div>
      <div class="msg-role-name">${isUser ? 'Tú' : 'Claude'}</div>
    </div>
    <div class="msg-content${isUser ? ' user-text' : ''}" ${streaming ? 'id="stream-cnt"' : ''}>
      ${isUser
        ? esc(content)
        : (streaming
            ? '<div class="typing-dots"><span></span><span></span><span></span></div>'
            : marked.parse(content))
      }
    </div>
    ${!isUser && !streaming ? `
      <div class="msg-actions">
        <button class="action-btn" onclick="cpMsg(this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copiar
        </button>
      </div>` : ''}`;

  chatInner.appendChild(grp);
  scrollBottom();
  return grp;
}

// ── COPIAR CÓDIGO
window.cpCode = id => {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.closest('pre').querySelector('.code-copy');
    if (btn) { btn.textContent = '¡Copiado!'; setTimeout(() => btn.textContent = 'Copiar', 2000); }
  });
};

// ── COPIAR MENSAJE
window.cpMsg = btn => {
  const cnt = btn.closest('.msg-group').querySelector('.msg-content');
  navigator.clipboard.writeText(cnt.innerText).then(() => {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ¡Copiado!`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar`;
    }, 2000);
  });
};

function scrollBottom() { chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' }); }

// ── ENVIAR MENSAJE
sendBtn.addEventListener('click', sendMsg);
stopBtn.addEventListener('click', () => { stopRequested = true; });

async function sendMsg() {
  const text = input.value.trim();
  if (!text || isGenerating) return;
  if (!currentId) newChat();

  const conv = convs.find(c => c.id === currentId);
  if (!conv) return;

  conv.msgs.push({ role: 'user', content: text });
  if (conv.title === 'Nueva conversación') {
    conv.title = text.slice(0, 52) + (text.length > 52 ? '…' : '');
  }
  save();
  renderSidebar();

  appendMsg('user', text, false);
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  isGenerating     = true;
  stopRequested    = false;

  const streamGrp = appendMsg('assistant', '', true);
  const streamCnt = document.getElementById('stream-cnt');
  stopBtn.classList.add('active');

  let full = '';

  try {
    const history = conv.msgs.map(m => ({ role: m.role, content: m.content }));
    const res = await puter.ai.chat(history, { model: currentModel, stream: true });
    if (streamCnt) streamCnt.innerHTML = '';
    for await (const part of res) {
      if (stopRequested) break;
      const delta = part?.text ?? part?.delta?.text ?? '';
      if (delta) {
        full += delta;
        if (streamCnt) { streamCnt.innerHTML = marked.parse(full); scrollBottom(); }
      }
    }
  } catch (err) {
    full = `⚠️ **Error al conectar con Puter.js / Claude.**\n\nAsegúrate de:\n1. Estar logueado en [puter.com](https://puter.com)\n2. Tener conexión a internet\n\n*Error:* \`${esc(String(err.message || err))}\``;
    if (streamCnt) streamCnt.innerHTML = marked.parse(full);
  } finally {
    streamGrp.removeAttribute('id');
    const sc = streamGrp.querySelector('[id="stream-cnt"]');
    if (sc) sc.removeAttribute('id');
    const act = document.createElement('div');
    act.className = 'msg-actions';
    act.innerHTML = `<button class="action-btn" onclick="cpMsg(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copiar
    </button>`;
    streamGrp.appendChild(act);
    conv.msgs.push({ role: 'assistant', content: full });
    save();
    isGenerating  = false;
    stopRequested = false;
    stopBtn.classList.remove('active');
    sendBtn.disabled = !input.value.trim();
    scrollBottom();
  }
}

// ── EXPORTAR .TXT
function exportChat() {
  if (!currentId) return;
  const conv = convs.find(c => c.id === currentId);
  if (!conv || !conv.msgs.length) return alert('No hay mensajes para exportar.');
  const txt = conv.msgs.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const a  = document.createElement('a');
  a.href   = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  a.download = (conv.title || 'chat').replace(/[^a-z0-9áéíóúñ ]/gi, '_').slice(0, 40) + '.txt';
  a.click();
}

// ── INICIALIZAR
load();
renderSidebar();
renderChat();
