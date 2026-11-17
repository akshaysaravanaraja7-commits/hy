import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Atom,
  LayoutGrid,
  AudioLines,
  Menu,
  Copy,
  Plus,
  Settings,
  CircleHelp,
  Bell,
  SlidersHorizontal,
  MessageSquare,
  Send,
  Paperclip,
  Mic,
  Volume2,
  VolumeX,
  Trash2,
  Sparkles,
  X,
  FileText,
  Pencil,
  Check,
  SquarePen,
  KeyRound,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

const starter = [
  { icon: '✦', title: 'Think clearly', desc: 'Break complex ideas into simple, useful steps.' },
  { icon: '⌘', title: 'Build something', desc: 'Plan, design and develop your next big idea.' },
  { icon: '◎', title: 'Explore a topic', desc: 'Understand the details, not just the headlines.' }
];

const genId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
};

function Orb({ small = false }) {
  return (
    <div className={`orb ${small ? 'orb-small' : ''}`}>
      <div className="orb-core" />
      <i />
      <b />
      <em />
    </div>
  );
}

function App() {
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('gpt-4o-mini');
  const [models, setModels] = useState(['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o3-mini', 'gpt-3.5-turbo']);
  const [style, setStyle] = useState('Balanced');
  const [systemNote, setSystemNote] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('astra_api_key') || '');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [systemMode, setSystemMode] = useState('Companion Mode');
  const [showSettings, setShowSettings] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [voice, setVoice] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [toast, setToast] = useState('');

  // Renaming chat state
  const [editingChatId, setEditingChatId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const bottom = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const refreshChats = async () => {
    try {
      const res = await fetch(`${API}/api/chats`);
      if (res.ok) {
        setChats(await res.json());
      }
    } catch {}
  };

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setKeyConfigured(Boolean(data.configured));
        if (data.mode) setSystemMode(data.mode);
        if (data.model) setModel(data.model);
      }
    } catch {}
  };

  useEffect(() => {
    refreshChats();
    checkHealth();
    fetch(`${API}/api/models`)
      .then((r) => r.json())
      .then((d) => {
        if (d.models && Array.isArray(d.models)) setModels(d.models);
        if (d.default) setModel(d.default);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const newChat = async () => {
    try {
      const r = await fetch(`${API}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' })
      });
      if (!r.ok) throw new Error('Could not create chat');
      const c = await r.json();
      setActive(c.id);
      setMessages([]);
      await refreshChats();
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      notify('Could not create a new chat.');
    }
  };

  const openChat = async (id) => {
    try {
      const r = await fetch(`${API}/api/chats/${id}/messages`);
      if (!r.ok) throw new Error('Could not load messages');
      const msgs = await r.json();
      setMessages(msgs);
      setActive(id);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {
      notify('Could not load this conversation.');
    }
  };

  const removeChat = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;
    try {
      const res = await fetch(`${API}/api/chats/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (active === id) {
          setActive(null);
          setMessages([]);
        }
        refreshChats();
        notify('Conversation deleted');
      }
    } catch {
      notify('Failed to delete conversation');
    }
  };

  const startRenameChat = (chat, e) => {
    e?.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const saveRenameChat = async (id, e) => {
    e?.stopPropagation();
    const clean = editTitle.trim();
    if (!clean) {
      setEditingChatId(null);
      return;
    }
    try {
      const res = await fetch(`${API}/api/chats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: clean })
      });
      if (res.ok) {
        setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
        notify('Conversation renamed');
      }
    } catch {
      notify('Failed to rename conversation');
    } finally {
      setEditingChatId(null);
    }
  };

  const cancelRenameChat = (e) => {
    e?.stopPropagation();
    setEditingChatId(null);
  };

  const send = async (textToSend = input) => {
    const content = textToSend.trim();
    if (!content || loading) return;

    let cid = active;
    if (!cid) {
      try {
        const r = await fetch(`${API}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New conversation' })
        });
        if (!r.ok) throw new Error();
        const data = await r.json();
        cid = data.id;
        setActive(cid);
      } catch {
        notify('Start backend server to chat with ASTRA.');
        return;
      }
    }

    const currentAttachment = attachment;
    const tempUserMsgId = genId();
    const tempAssistMsgId = genId();

    const optimistic = [
      ...messages,
      { id: tempUserMsgId, role: 'user', content },
      { id: tempAssistMsgId, role: 'assistant', content: '' }
    ];

    setMessages(optimistic);
    setInput('');
    setAttachment(null);
    setLoading(true);

    try {
      const response = await fetch(`${API}/api/chats/${cid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          model,
          style,
          system_note: systemNote,
          attachment_text: currentAttachment?.text || '',
          api_key: apiKey.trim() || undefined
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.detail || 'Request failed';
        setMessages((prev) => prev.filter((m) => m.id !== tempAssistMsgId));
        setInput(content);
        if (currentAttachment) setAttachment(currentAttachment);
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        answer += chunk;
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
            next[lastIdx] = { ...next[lastIdx], content: answer };
          }
          return next;
        });
      }
    } catch (e) {
      notify(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
      refreshChats();
      checkHealth();
    }
  };

  const uploadFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      notify(`Reading ${file.name}...`);
      const r = await fetch(`${API}/api/files/extract`, {
        method: 'POST',
        body: fd
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Upload failed');
      setAttachment(d);
      notify(`${file.name} attached (${d.truncated ? 'first 50KB' : 'complete'})`);
    } catch (e) {
      notify(e.message || 'Could not read file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      notify('Voice recognition is not supported in this browser.');
      return;
    }
    if (voice && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setVoice(false);
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      rec.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript || '';
        if (transcript) {
          setInput((v) => (v ? `${v} ${transcript}` : transcript));
        }
      };
      rec.onerror = (e) => {
        setVoice(false);
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          notify(`Voice input: ${e.error}`);
        }
      };
      rec.onend = () => setVoice(false);
      rec.start();
      setVoice(true);
    } catch {
      setVoice(false);
      notify('Could not start microphone');
    }
  };

  const toggleSpeak = (msgId, rawText) => {
    if (!('speechSynthesis' in window)) {
      notify('Speech playback is not supported in this browser.');
      return;
    }
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = rawText
      .replace(/\[ASTRA_ERROR\][\s\S]*$/g, '')
      .replace(/[*#`_~\[\]()]/g, '')
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.onstart = () => setSpeakingMsgId(msgId);
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    window.speechSynthesis.speak(utterance);
  };

  const copyText = (text) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      notify('Copied to clipboard');
    }
  };

  const saveSettings = async () => {
    if (apiKey) {
      localStorage.setItem('astra_api_key', apiKey.trim());
    }
    try {
      await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim(), model })
      });
      await checkHealth();
      notify('Preferences updated');
    } catch {
      notify('Preferences saved locally');
    }
    setShowSettings(false);
  };

  const selectStarter = (promptText) => {
    send(promptText);
  };

  const formatTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const activeChat = chats.find((c) => c.id === active);

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className={`sidebar ${sidebar ? '' : 'collapsed'}`}>
        <div className="brand-row">
          <div className="brand-mark" onClick={() => setActive(null)} style={{ cursor: 'pointer' }} title="ASTRA Home">
            <Orb small />
          </div>
          {sidebar && <span className="brand-name">Astra</span>}
          <button className="icon-btn menu-toggle" onClick={() => setSidebar(!sidebar)} title="Toggle sidebar">
            <Menu size={18} />
          </button>
        </div>

        <div className="side-icons">
          <button
            className={`side-icon ${!active ? 'selected' : ''}`}
            onClick={() => setActive(null)}
            title="Overview / Home"
          >
            <LayoutGrid />
          </button>
          <button
            className={`side-icon ${voice ? 'selected' : ''}`}
            onClick={toggleVoice}
            title={voice ? 'Stop listening' : 'Voice input'}
          >
            <AudioLines />
          </button>
          <button className="side-icon" onClick={newChat} title="New conversation">
            <SquarePen />
          </button>
          <button className="side-icon" onClick={() => fileRef.current?.click()} title="Attach file">
            <FolderOpen />
          </button>
        </div>

        {sidebar && (
          <>
            <div className="side-section">
              <div className="section-heading">
                Recent chats{' '}
                <button className="tiny-btn" onClick={newChat} title="New chat">
                  <Plus size={15} />
                </button>
              </div>

              <div className="chat-list">
                {chats.map((c) => (
                  <div key={c.id} className={`chat-item ${active === c.id ? 'active' : ''}`}>
                    {editingChatId === c.id ? (
                      <form className="chat-rename-form" onSubmit={(e) => { e.preventDefault(); saveRenameChat(c.id, e); }}>
                        <input
                          className="chat-rename-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelRenameChat(e);
                          }}
                        />
                        <button type="submit" className="chat-action-btn" title="Save">
                          <Check size={13} />
                        </button>
                        <button type="button" className="chat-action-btn" onClick={cancelRenameChat} title="Cancel">
                          <X size={13} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button onClick={() => openChat(c.id)}>
                          <MessageSquare size={15} />
                          <span>{c.title || 'Untitled chat'}</span>
                        </button>
                        <div className="chat-item-actions">
                          <button
                            className="chat-action-btn"
                            onClick={(e) => startRenameChat(c, e)}
                            title="Rename"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="chat-action-btn delete"
                            onClick={(e) => removeChat(c.id, e)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!chats.length && <div className="empty-side">Your conversations will appear here.</div>}
              </div>
            </div>

            <div className="side-section integrations">
              <div className="section-heading">Capabilities</div>
              <button className="integration-item" onClick={() => notify('AI Companion Engine is active and ready.')}>
                <Atom size={17} /> Live Companion Core
              </button>
              <button className="integration-item" onClick={() => fileRef.current?.click()}>
                <FileText size={17} /> Document Analysis
              </button>
            </div>

            <div className="side-bottom">
              <div className="palette-card">
                <div>Personalized system</div>
                <div className="swatch">
                  <i /> #FFBF00
                </div>
                <div className="swatch muted">
                  <i /> #FFBF06
                </div>
                <div className="swatch orange">
                  <i /> #D97706
                </div>
              </div>
              <button className="settings-link" onClick={() => setShowSettings(true)}>
                <SlidersHorizontal size={16} /> Input settings
              </button>
            </div>
          </>
        )}

        <div className="side-footer">
          <button className="side-icon" onClick={() => notify(`ASTRA Status: ${systemMode}. All systems nominal.`)} title="System status">
            <Bell />
          </button>
          <button className="side-icon" onClick={() => notify('ASTRA: Ask questions, click cards, or attach files.')} title="Help">
            <CircleHelp />
          </button>
          <button className="side-icon" onClick={() => setShowSettings(true)} title="Settings">
            <Settings />
          </button>
        </div>
      </aside>

      {/* MAIN PANEL */}
      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand" onClick={() => setActive(null)}>
            <Orb small />
            <span>ASTRA</span>
          </div>

          <div className="top-status">
            <span className="status-dot" /> SYSTEM ONLINE <span className="top-divider">/</span> {formatTime()}
            <span
              className="key-badge ready"
              onClick={() => setShowSettings(true)}
              style={{ cursor: 'pointer' }}
              title="Click to view AI Settings"
            >
              <KeyRound size={10} style={{ marginRight: 4 }} />
              {keyConfigured || apiKey ? 'GPT-4o Cloud' : 'Companion Active'}
            </span>
          </div>

          <button className="top-new" onClick={newChat}>
            <Plus size={15} /> New chat
          </button>
        </header>

        <div className="ambient-grid" />

        <section className="content-area">
          {messages.length === 0 ? (
            <div className="welcome-wrap">
              <div className="welcome-heading">
                <Orb />
                <div>
                  <div className="eyebrow">YOUR INTELLIGENT COMPANION</div>
                  <h1>
                    <span>ASTRA</span>
                    <b>•</b> Companion AI
                  </h1>
                  <p>A little more clarity. A lot more possibility.</p>
                </div>
              </div>

              <div className="welcome-card">
                <div className="welcome-card-top">
                  <span className="pulse-dot" /> <span>ASTRA IS READY</span>
                  <span className="card-time">{formatTime()}</span>
                </div>
                <p>
                  Hello. I'm Astra, your AI companion. I can help you think through ideas, solve problems, create
                  things, and explore what's possible. Click any card below or type a message to start!
                </p>
                <div className="welcome-meta">
                  <span>
                    <Sparkles size={13} /> Embedded Full-Stack Edition
                  </span>
                  <span>Engine: {keyConfigured || apiKey ? model : 'Companion v1 (Ready)'}</span>
                </div>
              </div>

              <div className="suggestion-grid">
                {starter.map((s) => (
                  <button
                    key={s.title}
                    onClick={() =>
                      selectStarter(
                        s.title === 'Think clearly'
                          ? 'Help me think through a complex problem step by step.'
                          : s.title === 'Build something'
                          ? 'Help me plan and build an intelligent application.'
                          : 'Teach me something profound and interesting about artificial intelligence.'
                      )
                    }
                  >
                    <span>{s.icon}</span>
                    <b>{s.title}</b>
                    <small>{s.desc}</small>
                  </button>
                ))}
              </div>

              <div className="welcome-foot">
                <span>✧</span> Ask anything. Build something meaningful.
              </div>
            </div>
          ) : (
            <div className="conversation">
              <div className="conversation-title">
                <div>
                  <span className="eyebrow">ASTRA SESSION</span>
                  <h2>{activeChat?.title || 'Conversation'}</h2>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => copyText(messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n'))}
                  title="Copy conversation"
                >
                  <Copy size={16} />
                </button>
              </div>

              {messages.map((m, i) => {
                const isError = m.content && m.content.includes('[ASTRA_ERROR]');
                const cleanContent = isError
                  ? m.content.split('[ASTRA_ERROR]')[0].trim()
                  : m.content;
                const errorPart = isError ? m.content.split('[ASTRA_ERROR]')[1]?.trim() : '';

                return (
                  <div className={`message-row ${m.role}`} key={m.id || i}>
                    {m.role === 'assistant' && (
                      <div className="avatar">
                        <Atom size={17} />
                      </div>
                    )}

                    <div className="message-content">
                      <div className="message-bubble">
                        {m.role === 'assistant' ? (
                          <>
                            {cleanContent ? <ReactMarkdown>{cleanContent}</ReactMarkdown> : null}
                            {isError && (
                              <div className="astra-error-card">
                                <div className="astra-error-head">
                                  <AlertTriangle size={15} /> AI Service Notification
                                </div>
                                <div>{errorPart || 'Could not complete response. Please check your API key.'}</div>
                                <button className="astra-error-btn" onClick={() => setShowSettings(true)}>
                                  Configure API Key in Settings
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          m.content
                        )}
                      </div>

                      {m.role === 'assistant' && m.content && (
                        <div className="message-actions">
                          <button onClick={() => copyText(m.content)}>
                            <Copy size={12} /> Copy
                          </button>
                          <button
                            onClick={() => toggleSpeak(m.id || String(i), m.content)}
                            className={speakingMsgId === (m.id || String(i)) ? 'speaking-pulse' : ''}
                          >
                            {speakingMsgId === (m.id || String(i)) ? (
                              <>
                                <VolumeX size={12} /> Stop
                              </>
                            ) : (
                              <>
                                <Volume2 size={12} /> Read aloud
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {m.role === 'user' && <div className="user-avatar">Y</div>}
                  </div>
                );
              })}

              {loading && messages[messages.length - 1]?.content === '' && (
                <div className="thinking">
                  <span />
                  <span />
                  <span /> <small>ASTRA is thinking</small>
                </div>
              )}
              <div ref={bottom} />
            </div>
          )}
        </section>

        {/* COMPOSER */}
        <div className="composer-zone">
          <div className="waveform">
            {Array.from({ length: 19 }).map((_, idx) => (
              <span key={idx} />
            ))}
          </div>

          {attachment && (
            <div className="attachment-chip">
              <FileText size={14} />
              <span>{attachment.filename}</span>
              <button onClick={() => setAttachment(null)} title="Remove attachment">
                <X size={13} />
              </button>
            </div>
          )}

          <div className="composer">
            <button
              className="composer-tool"
              onClick={() => fileRef.current?.click()}
              title="Attach document or code file"
            >
              <Paperclip size={18} />
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={attachment ? 'Ask something about the attached file...' : 'Ask ASTRA anything...'}
            />

            <button
              className={`composer-tool mic ${voice ? 'recording' : ''}`}
              onClick={toggleVoice}
              title={voice ? 'Stop voice recording' : 'Start voice input'}
            >
              <Mic size={18} />
            </button>

            <button
              className="send-btn"
              onClick={() => send()}
              disabled={(!input.trim() && !attachment) || loading}
              title="Send message"
            >
              <Send size={17} />
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".pdf,.docx,.txt,.md,.csv,.json,.py,.js,.jsx,.ts,.tsx,.html,.css,.yaml,.yml,.xml,.log,.sql"
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />

          <div className="composer-caption">
            <span>ASTRA Companion • Verify important information</span>
            <span>{keyConfigured || apiKey ? model : 'ASTRA Companion Core'}</span>
          </div>
        </div>
      </main>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">PREFERENCES</span>
                <h2>Input & System Settings</h2>
              </div>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>
                <X />
              </button>
            </div>

            <label>
              OpenAI API Key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-proj-... (optional: connects to cloud GPT-4o)"
                style={{
                  border: '1px solid #805331',
                  background: '#1b110b',
                  color: '#f0d4ad',
                  borderRadius: 9,
                  padding: 11,
                  outline: 'none',
                  fontSize: 12
                }}
              />
              <span style={{ fontSize: 10, color: '#98734e', marginTop: 3 }}>
                {keyConfigured || apiKey
                  ? '✓ Cloud API key configured. Responses use live OpenAI models.'
                  : 'Currently operating in Standalone Companion Mode (ready to chat immediately).'}
              </span>
            </label>

            <label>
              AI Model
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Response Style
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {['Balanced', 'Concise', 'Detailed', 'Creative', 'Technical'].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Personal Instructions
              <textarea
                value={systemNote}
                onChange={(e) => setSystemNote(e.target.value)}
                placeholder="Tell ASTRA how you'd like it to respond (e.g. 'Format answers with code examples', 'Be warm and witty')..."
                rows={4}
              />
            </label>

            <div className="modal-note">
              <Sparkles size={15} /> Preferences are saved and applied to all future messages.
            </div>

            <button className="save-btn" onClick={saveSettings}>
              <Check size={16} /> Save preferences
            </button>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
