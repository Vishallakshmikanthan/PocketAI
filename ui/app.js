'use strict';

const API_BASE = 'http://127.0.0.1:8080';
const ENDPOINT = `${API_BASE}/v1/chat/completions`;
const HEALTH_INTERVAL_MS = 8000;
const STORAGE_KEY = 'pocketai_conversations_v1';
const CURRENT_CHAT_KEY = 'pocketai_current_chat_v1';
const MAX_CONVERSATIONS = 50;

const state = {
  messages: [],
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  totalTokens: 0,
  serverOnline: null,
  lastSpeaker: null,
};

const dom = {
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  messageList: document.getElementById('messageList'),
  emptyState: document.getElementById('emptyState'),
  chatArea: document.getElementById('chatArea'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  clearBtn: document.getElementById('clearBtn'),
  exportBtn: document.getElementById('exportBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  chatHistory: document.getElementById('chatHistory'),
  statusDot: document.getElementById('statusDot'),
  statusLabel: document.getElementById('statusLabel'),
  topStatusDot: document.getElementById('topStatusDot'),
  tokenCount: document.getElementById('tokenCount'),
  charCount: document.getElementById('charCount'),
  msgCount: document.getElementById('msgCount'),
  tempSlider: document.getElementById('tempSlider'),
  tempVal: document.getElementById('tempVal'),
  tokensSlider: document.getElementById('tokensSlider'),
  tokensVal: document.getElementById('tokensVal'),
  systemPrompt: document.getElementById('systemPrompt'),
  errorToast: document.getElementById('errorToast'),
  infoToast: document.getElementById('infoToast'),
};

function init() {
  loadConversations();
  bindEvents();
  autoResizeTextarea(dom.messageInput);

  if (state.conversations.length === 0) {
    createConversation(false);
  } else {
    const savedId = localStorage.getItem(CURRENT_CHAT_KEY);
    const target = state.conversations.find(c => c.id === savedId) || state.conversations[0];
    loadConversation(target.id);
  }

  checkServerHealth();
  setInterval(checkServerHealth, HEALTH_INTERVAL_MS);
  updateSendBtn();
  updateCharCount();
  updateStats();
}

function bindEvents() {
  dom.messageInput.addEventListener('keydown', e => {
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
  dom.newChatBtn.addEventListener('click', () => createConversation(true));

  dom.tempSlider.addEventListener('input', () => {
    dom.tempVal.textContent = parseFloat(dom.tempSlider.value).toFixed(2);
    updateCurrentSettings();
  });

  dom.tokensSlider.addEventListener('input', () => {
    dom.tokensVal.textContent = dom.tokensSlider.value;
    updateCurrentSettings();
  });

  dom.systemPrompt.addEventListener('input', updateCurrentSettings);
  dom.sidebarToggle.addEventListener('click', toggleSidebar);

  document.addEventListener('click', e => {
    if (dom.sidebar.classList.contains('open') &&
        !dom.sidebar.contains(e.target) &&
        e.target !== dom.sidebarToggle) {
      closeSidebar();
    }
  });
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) state.conversations = parsed.slice(0, MAX_CONVERSATIONS);
  } catch {
    state.conversations = [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
    if (state.currentConversationId) localStorage.setItem(CURRENT_CHAT_KEY, state.currentConversationId);
  } catch (err) {
    showToast(dom.errorToast, `could not save history: ${err.message}`);
  }
}

function createConversation(showNotice = true) {
  const conversation = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: 'new conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    temperature: 0.7,
    maxTokens: 512,
    systemPrompt: '',
  };

  state.conversations.unshift(conversation);
  state.conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
  loadConversation(conversation.id);

  if (showNotice) showToast(dom.infoToast, 'new conversation');
}

function loadConversation(id) {
  const conversation = state.conversations.find(c => c.id === id);
  if (!conversation) return;

  state.currentConversationId = conversation.id;
  state.messages = Array.isArray(conversation.messages) ? [...conversation.messages] : [];
  state.lastSpeaker = null;
  state.totalTokens = 0;
  dom.tokenCount.textContent = '0';

  dom.tempSlider.value = String(conversation.temperature ?? 0.7);
  dom.tempVal.textContent = Number(dom.tempSlider.value).toFixed(2);
  dom.tokensSlider.value = String(conversation.maxTokens ?? 512);
  dom.tokensVal.textContent = dom.tokensSlider.value;
  dom.systemPrompt.value = conversation.systemPrompt ?? '';

  renderChatHistory();
  renderCurrentConversation();
  updateStats();
  updateCharCount();
  saveConversations();
  closeSidebar();
  dom.messageInput.focus();
}

function updateCurrentSettings() {
  const conversation = getCurrentConversation();
  if (!conversation) return;

  conversation.temperature = parseFloat(dom.tempSlider.value);
  conversation.maxTokens = parseInt(dom.tokensSlider.value, 10);
  conversation.systemPrompt = dom.systemPrompt.value;
  conversation.updatedAt = Date.now();
  saveConversations();
}

function getCurrentConversation() {
  return state.conversations.find(c => c.id === state.currentConversationId);
}

function saveCurrentConversation() {
  const conversation = getCurrentConversation();
  if (!conversation) return;

  conversation.messages = [...state.messages];
  conversation.updatedAt = Date.now();

  const firstUser = state.messages.find(m => m.role === 'user');
  if (firstUser) {
    conversation.title = firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 42) || 'conversation';
  }

  saveConversations();
  renderChatHistory();
}

function deleteConversation(id) {
  const index = state.conversations.findIndex(c => c.id === id);
  if (index === -1) return;

  const wasCurrent = state.currentConversationId === id;
  state.conversations.splice(index, 1);

  if (wasCurrent) {
    if (state.conversations.length === 0) {
      createConversation(false);
      return;
    }
    loadConversation(state.conversations[0].id);
  } else {
    saveConversations();
    renderChatHistory();
  }
}

function renderChatHistory() {
  if (!dom.chatHistory) return;

  dom.chatHistory.innerHTML = '';

  state.conversations
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .forEach(conversation => {
      const row = document.createElement('div');
      row.className = `history-row${conversation.id === state.currentConversationId ? ' active' : ''}`;

      const button = document.createElement('button');
      button.className = 'history-item';
      button.type = 'button';
      button.title = conversation.title;
      button.textContent = conversation.title || 'new conversation';
      button.addEventListener('click', () => loadConversation(conversation.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-delete';
      deleteBtn.type = 'button';
      deleteBtn.title = 'Delete conversation';
      deleteBtn.setAttribute('aria-label', 'Delete conversation');
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteConversation(conversation.id);
      });

      row.append(button, deleteBtn);
      dom.chatHistory.appendChild(row);
    });
}

function renderCurrentConversation() {
  dom.messageList.innerHTML = '';
  state.lastSpeaker = null;

  if (!state.messages.length) {
    showEmptyState();
    return;
  }

  hideEmptyState();

  state.messages.forEach(message => {
    const isNewSpeaker = state.lastSpeaker !== message.role;
    state.lastSpeaker = message.role;

    const el = document.createElement('div');
    el.classList.add('message', message.role);
    if (isNewSpeaker) el.classList.add('new-speaker');

    el.innerHTML = `
      <div class="msg-gutter"><span class="msg-role">${message.role === 'user' ? 'you' : 'ai'}</span></div>
      <div class="msg-body">
        <div class="msg-content">${renderContent(message.content)}</div>
        <div class="msg-time">${formatTime(message.time || Date.now())}</div>
      </div>
    `;

    dom.messageList.appendChild(el);
  });

  scrollToBottom();
}

async function checkServerHealth() {
  setServerStatus('checking');

  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    setServerStatus(res.ok ? 'online' : 'offline');
  } catch {
    setServerStatus('offline');
  }
}

function setServerStatus(status) {
  dom.statusDot.className = `status-dot ${status}`;
  dom.topStatusDot.className = `status-dot-sm ${status}`;

  const labels = { checking: 'connecting', online: 'online', offline: 'offline' };
  dom.statusLabel.textContent = labels[status] || status;
  state.serverOnline = status === 'online';
}

async function handleSend() {
  const text = dom.messageInput.value.trim();
  if (!text || state.isLoading) return;

  appendMessage('user', text);
  saveCurrentConversation();

  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  updateSendBtn();
  updateCharCount();
  updateStats();

  setLoading(true);
  const typingEl = appendTyping();

  try {
    const reply = await callLLM(buildMessages());
    removeTyping(typingEl);
    appendMessage('assistant', reply);
    saveCurrentConversation();
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

  if (sys) msgs.push({ role: 'system', content: sys });
  state.messages.forEach(m => msgs.push({ role: m.role, content: m.content }));

  return msgs;
}

async function callLLM(messages) {
  const payload = {
    messages,
    temperature: parseFloat(dom.tempSlider.value),
    max_tokens: parseInt(dom.tokensSlider.value, 10),
    stream: false,
  };

  let res;

  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('request timed out — is the server running?');
    if (err.name === 'TypeError') throw new Error('cannot reach 127.0.0.1:8080 — start llama.cpp server first');
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
  if (content == null) throw new Error('unexpected response shape from server');

  if (data.usage?.total_tokens) {
    state.totalTokens += data.usage.total_tokens;
    dom.tokenCount.textContent = state.totalTokens;
  }

  return content;
}

function appendMessage(role, content) {
  state.messages.push({ role, content, time: Date.now() });
  hideEmptyState();

  const isNewSpeaker = state.lastSpeaker !== role;
  state.lastSpeaker = role;

  const el = document.createElement('div');
  el.classList.add('message', role);
  if (isNewSpeaker) el.classList.add('new-speaker');

  el.innerHTML = `
    <div class="msg-gutter"><span class="msg-role">${role === 'user' ? 'you' : 'ai'}</span></div>
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
    <div class="msg-gutter"><span class="msg-role">ai</span></div>
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
  const el = document.createElement('div');
  el.classList.add('message', 'assistant', 'new-speaker');

  el.innerHTML = `
    <div class="msg-gutter"><span class="msg-role">err</span></div>
    <div class="msg-body"><div class="msg-error">⚠ ${escapeHtml(msg)}</div></div>
  `;

  dom.messageList.appendChild(el);
  scrollToBottom();
}

function renderContent(raw) {
  let html = escapeHtml(raw);

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code.trimEnd()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  return html.split(/\n{2,}/).map(p => {
    p = p.replace(/\n/g, '<br>');
    return p.startsWith('<pre>') ? p : `<p>${p}</p>`;
  }).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  dom.emptyState.style.display = 'none';
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

function clearConversation() {
  state.messages = [];
  state.lastSpeaker = null;
  state.totalTokens = 0;
  dom.tokenCount.textContent = '0';
  dom.messageList.innerHTML = '';
  showEmptyState();
  updateStats();
  saveCurrentConversation();
  dom.messageInput.focus();
  showToast(dom.infoToast, 'session cleared');
}

function exportConversation() {
  if (!state.messages.length) {
    showToast(dom.infoToast, 'nothing to export');
    return;
  }

  const conversation = getCurrentConversation();
  const data = {
    exported: new Date().toISOString(),
    title: conversation?.title || 'PocketAI conversation',
    model: 'llama.cpp (local)',
    temperature: parseFloat(dom.tempSlider.value),
    max_tokens: parseInt(dom.tokensSlider.value, 10),
    system_prompt: dom.systemPrompt.value,
    messages: state.messages.map(m => ({
      role: m.role,
      content: m.content,
      time: new Date(m.time).toISOString(),
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = `pocketai-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showToast(dom.infoToast, 'log exported');
}

let toastTimer = null;

function showToast(el, msg, duration = 3000) {
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function autoResizeTextarea(el) {
  el.addEventListener('input', () => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  });
}

function toggleSidebar() {
  if (dom.sidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
}

function openSidebar() {
  dom.sidebar.classList.add('open');
  ensureOverlay();
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.remove();
}

function ensureOverlay() {
  if (document.getElementById('sidebarOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'sidebarOverlay';
  overlay.className = 'sidebar-overlay';
  overlay.addEventListener('click', closeSidebar);
  document.body.appendChild(overlay);
}

init();
