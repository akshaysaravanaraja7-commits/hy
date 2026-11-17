# ASTRA AI — Embedded Full-Stack Companion AI

ASTRA is an intelligent AI companion featuring a dark espresso aesthetic, warm amber/gold accents, luminous composer, voice recognition, speech synthesis, document ingestion, and conversation management.

**This version is fully embedded**: Both frontend (React + Vite + Tailwind) and backend (FastAPI + SQLite + OpenAI) are integrated to run seamlessly together on a single port (`http://localhost:8000`).

---

## ⚡ Quick Start (Single Command)

### Prerequisites
- Python 3.10+ (with requirements installed)
- An OpenAI API Key (can be configured in `backend/.env` or directly inside the web UI Settings)

### Launch
```bash
# Windows
start.bat
# or: python run.py

# macOS / Linux
chmod +x start.sh && ./start.sh
# or: python3 run.py
```
Open your browser at **http://localhost:8000** (it opens automatically).

---

## 🛠️ Features & Bug Fixes Applied

1. **Embedded Single-Port Architecture**:
   - Production React frontend is embedded and served directly by FastAPI via SPA static mounting.
   - Eliminates CORS issues, dual terminal management, and port mismatch bugs.
2. **Fixed Concurrency & Database Locking**:
   - Replaced unclosed SQLite connections with a robust context manager (`get_db()`).
   - Enabled WAL mode (`PRAGMA journal_mode = WAL;`) and busy timeout to prevent "database is locked" errors.
   - Enforced foreign key cascades (`PRAGMA foreign_keys = ON;`).
3. **Conversation Renaming in UI**:
   - Added interactive inline conversation renaming with save/cancel in the sidebar.
4. **Optimistic Rollback & Input Preservation**:
   - Fixed bug where failed message requests permanently removed user input while leaving phantom bubbles in the chat. Now restores input on error.
5. **Safe ID Generation**:
   - Fixed crash where `crypto.randomUUID()` threw exceptions in non-HTTPS / local IP contexts.
6. **Voice Input Microphone Toggle**:
   - Replaced buggy voice recognition with a toggleable microphone (`rec.stop()` on second click, browser language support, and error state handling).
7. **Speech Synthesis (Read Aloud) Toggle**:
   - Fixed speech synthesis to toggle off when clicked again, strip markdown before speaking, and handle utterance errors cleanly.
8. **Expanded File Upload / Code Ingestion**:
   - Supported documents and code files: `.pdf`, `.docx`, `.txt`, `.md`, `.csv`, `.json`, `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.html`, `.css`, `.sql`, `.sh`, `.yaml`.
9. **UI Settings API Key Configuration**:
   - Users can enter or update their OpenAI API key directly inside the Settings modal (gear icon) without editing files.
10. **Modern OpenAI Model Support**:
    - Defaulted to `gpt-4o-mini`, with support for `gpt-4o`, `gpt-4-turbo`, `o3-mini`, and `gpt-3.5-turbo`.

---

## 💻 Development Mode (Optional)

If you wish to edit the frontend with Hot Module Replacement (HMR):
```bash
# Backend (Terminal 1)
cd backend
python -m uvicorn main:app --reload --port 8000

# Frontend (Terminal 2)
cd frontend
npm install
npm run dev
```
Vite is pre-configured with a dev proxy forwarding `/api` requests to `http://localhost:8000`.
To re-build the embedded assets:
```bash
npm run build
```
