/**
 * PocketAI — app.js
 * Offline-first local AI chat frontend
 * Connects to llama.cpp at http://127.0.0.1:8080
 */

'use strict';

// ─── Config ────────────────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:8080';
const ENDPOINT = `${API_BASE}/v1/chat/completions`;
const HEALTH_INTERVAL_MS = 8000;

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  messages: [],          // { role, content, time }
  isLoading: false,
  totalTokens: 0,
  serverOnline: null,    // null | true | false
  lastSpeaker: null,
};

// ─── DOM refs ──────────────────────────────────────────────────────────────
const dom = {
  sidebar:         document.getElementById('sidebar'),
  sidebarToggle:   document.getElementById('sidebarToggle'),
  messageList:     document.getElementById('messageList'),
  emptyState:      document.getElementById('emptyState'),
  chatArea:        document.getElementById('chatArea'),
  messageInput:    document.getElementById('messageInput'),
  sendBtn:         document.getElementById('sendBtn'),
  clearBtn:        document.getElementById('clearBtn'),
  exportBtn:       document.getElementById('exportBtn'),
  statusDot:       document.getElementById('statusDot'),
  statusLabel:     document.getElementById('statusLabel'),
  topStatusDot:    document.getElementById('topStatusDot'),
  tokenCount:      document.getElementById('tokenCount'),
  charCount:       document.getElementById('charCount'),
  msgCount:        document.getElementById('msgCount'),
  tempSlider:      document.getElementById('tempSlider'),
  tempVal:         document.getElementById('tempVal'),
  tokensSlider:    document.getElementById('tokensSlider'),
  tokensVal:       document.getElementById('tokensVal'),
  systemPrompt:    document.getElementById('systemPrompt'),
  errorToast:      document.getElementById('errorToast'),
  infoToast:       document.getElementById('infoToast'),
};

// ─── Init ───────────────────────────────────────────────────────────────────
function init() {
  bindEvents();
  autoResizeTextarea(dom.messageInput);
  checkServerHealth();
  setInterval(checkServerHealth, HEALTH_INTERVAL_MS);
  updateSendBtn();
  updateStats();
}

// ─── Event Bindings ────────────────────────────────────────────────────────
function bindEvents() {
  // Send on Enter, newline on Shift+Enter
  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  dom.messageInput.addEventListener('input', () => {
    updateSendBtn();
    updateCharCount();
  });

  dom.sendBtn.addEventListener('click', handleSend);

  dom.clearBtn.addEventListener('click', clearConversation);

  dom.exportBtn.addEventListener('click', exportConversation);

  // Sliders
  dom.tempSlider.addEventListener('input', () => {
    dom.tempVal.textContent = parseFloat(dom.tempSlider.value).toFixed(2);
  });

  dom.tokensSlider.addEventListener('input', () => {
    dom.tokensVal.textContent = dom.tokensSlider.value;
  });

  // Mobile sidebar
  dom.sidebarToggle.addEventListener('click', toggleSidebar);

  // Click outside sidebar overlay
  document.addEventListener('click', (e) => {
    if (
      dom.sidebar.classList.contains('open') &&
      !dom.sidebar.contains(e.target) &&
      e.target !== dom.sidebarToggle
    ) {
      closeSidebar();
    }
  });
}

// ─── Server health check ────────────────────────────────────────────────────
async function checkServerHealth() {
  setServerStatus('checking');
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    // llama.cpp /health returns 200 when ready
    if (res.ok) {
      setServerStatus('online');
    } else {
      setServerStatus('offline');
    }
  } catch {
    // Fallback: try the actual endpoint with a tiny probe
    try {
      const probe = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(3000),
      });
      if (probe.ok || probe.status === 400) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
  }
}

function setServerStatus(status) {
  const dot   = dom.statusDot;
  const label = dom.statusLabel;
  const tdot  = dom.topStatusDot;

  dot.className  = `status-dot ${status}`;
  tdot.className = `status-dot-sm ${status}`;

  const labels = { checking: 'connecting', online: 'online', offline: 'offline' };
  label.textContent = labels[status] || status;

  state.serverOnline = status === 'online';
}

// ─── Send message ───────────────────────────────────────────────────────────
async function handleSend() {
  const text = dom.messageInput.value.trim();
  if (!text || state.isLoading) return;

  // Push user message
  appendMessage('user', text);
  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  updateSendBtn();
  updateCharCount();
  updateStats();

  setLoading(true);

  // Show typing indicator
  const typingEl = appendTyping();

  try {
    const reply = await callLLM(buildMessages());
    removeTyping(typingEl);
    appendMessage('assistant', reply);
    updateStats();
  } catch (err) {
    removeTyping(typingEl);
    appendError(err.message);
    showToast(dom.errorToast, err.message);
  } finally {
    setLoading(false);
  }

  scrollToBottom();
}

function buildMessages() {
  const msgs = [];

  const sys = dom.systemPrompt.value.trim();
  if (sys) {
    msgs.push({ role: 'system', content: sys });
  }

  state.messages.forEach(m => {
    msgs.push({ role: m.role, content: m.content });
  });

  return msgs;
}

async function callLLM(messages) {
  const temperature = parseFloat(dom.tempSlider.value);
  const max_tokens  = parseInt(dom.tokensSlider.value, 10);

  const payload = {
    messages,
    temperature,
    max_tokens,
    stream: false,
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error('request timed out — is the server running?');
    }
    if (err.name === 'TypeError') {
      throw new Error('cannot reach 127.0.0.1:8080 — start llama.cpp server first');
    }
    throw new Error(`network error: ${err.message}`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`server returned ${res.status}${detail ? ': ' + detail : ''}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('failed to parse server response');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null) {
    throw new Error('unexpected response shape from server');
  }

  // Track tokens if provided
  if (data.usage?.total_tokens) {
    state.totalTokens += data.usage.total_tokens;
    dom.tokenCount.textContent = state.totalTokens;
  }

  return content;
}

// ─── Message rendering ──────────────────────────────────────────────────────
function appendMessage(role, content) {
  state.messages.push({ role, content, time: Date.now() });
  hideEmptyState();

  const isNewSpeaker = state.lastSpeaker !== role;
  state.lastSpeaker = role;

  const el = document.createElement('div');
  el.classList.add('message', role);
  if (isNewSpeaker) el.classList.add('new-speaker');

  el.innerHTML = `
    <div class="msg-gutter">
      <span class="msg-role">${role === 'user' ? 'you' : 'ai'}</span>
    </div>
    <div class="msg-body">
      <div class="msg-content">${renderContent(content)}</div>
      <div class="msg-time">${formatTime(Date.now())}</div>
    </div>
  `;

  dom.messageList.appendChild(el);
  scrollToBottom();
  return el;
}

function appendTyping() {
  const el = document.createElement('div');
  el.classList.add('message', 'assistant', 'new-speaker');
  el.id = 'typingMsg';
  el.innerHTML = `
    <div class="msg-gutter">
      <span class="msg-role">ai</span>
    </div>
    <div class="msg-body">
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  dom.messageList.appendChild(el);
  scrollToBottom();
  return el;
}

function removeTyping(el) {
  if (el && el.parentNode) el.remove();
}

function appendError(msg) {
  // Append error inline in the chat
  const el = document.createElement('div');
  el.classList.add('message', 'assistant', 'new-speaker');
  el.innerHTML = `
    <div class="msg-gutter">
      <span class="msg-role">err</span>
    </div>
    <div class="msg-body">
      <div class="msg-error">⚠ ${escapeHtml(msg)}</div>
    </div>
  `;
  dom.messageList.appendChild(el);
  scrollToBottom();
}

// ─── Content renderer (minimal Markdown-lite) ────────────────────────────────
function renderContent(raw) {
  // Escape HTML first
  let html = escapeHtml(raw);

  // Code blocks ```lang\n...\n```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trimEnd()}</code></pre>`;
  });

  // Inline code `...`
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic *text*
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Newlines → paragraphs
  const paragraphs = html.split(/\n{2,}/);
  html = paragraphs.map(p => {
    p = p.replace(/\n/g, '<br>');
    // Don't wrap pre blocks in <p>
    if (p.startsWith('<pre>')) return p;
    return `<p>${p}</p>`;
  }).join('');

  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── UI helpers ─────────────────────────────────────────────────────────────
function setLoading(val) {
  state.isLoading = val;
  dom.sendBtn.disabled = val || !dom.messageInput.value.trim();

  if (val) {
    dom.sendBtn.classList.add('sending');
    dom.sendBtn.title = 'Waiting for response…';
    dom.messageInput.disabled = true;
  } else {
    dom.sendBtn.classList.remove('sending');
    dom.sendBtn.title = 'Send (Enter)';
    dom.messageInput.disabled = false;
    dom.messageInput.focus();
  }
}

function updateSendBtn() {
  dom.sendBtn.disabled = !dom.messageInput.value.trim() || state.isLoading;
}

function updateCharCount() {
  dom.charCount.textContent = dom.messageInput.value.length;
}

function updateStats() {
  const count = state.messages.length;
  dom.msgCount.textContent = `${count} message${count !== 1 ? 's' : ''}`;
}

function hideEmptyState() {
  if (dom.emptyState.style.display !== 'none') {
    dom.emptyState.style.display = 'none';
  }
}

function showEmptyState() {
  dom.emptyState.style.display = '';
}

function scrollToBottom() {
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Clear conversation ──────────────────────────────────────────────────────
function clearConversation() {
  state.messages = [];
  state.lastSpeaker = null;
  dom.messageList.innerHTML = '';
  showEmptyState();
  updateStats();
  dom.messageInput.focus();
  showToast(dom.infoToast, 'session cleared');
}

// ─── Export conversation ─────────────────────────────────────────────────────
function exportConversation() {
  if (!state.messages.length) {
    showToast(dom.infoToast, 'nothing to export');
    return;
  }
  const data = {
    exported: new Date().toISOString(),
    model: 'llama.cpp (local)',
    messages: state.messages.map(m => ({
      role: m.role,
      content: m.content,
      time: new Date(m.time).toISOString(),
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pocketai-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(dom.infoToast, 'log exported');
}

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(el, msg, duration = 3000) {
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Auto-resize textarea ────────────────────────────────────────────────────
function autoResizeTextarea(el) {
  el.addEventListener('input', () => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  });
}

// ─── Mobile sidebar toggle ───────────────────────────────────────────────────
function toggleSidebar() {
  if (dom.sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function openSidebar() {
  dom.sidebar.classList.add('open');
  ensureOverlay();
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.classList.remove('active');
}

function ensureOverlay() {
  let overlay = document.getElementById('sidebarOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
}

// ─── Keyboard shortcut: Escape closes sidebar ────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSidebar();
});

// ─── Boot ────────────────────────────────────────────────────────────────────
init();
