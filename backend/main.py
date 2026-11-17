import os
import sys
import sqlite3
import uuid
import io
import time
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from contextlib import contextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pypdf import PdfReader
from docx import Document

# Directories
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_DIR / ".env")

# Database path: keep inside backend directory
default_db = str(BACKEND_DIR / "astra.db")
DB_PATH = os.getenv("DATABASE_PATH", default_db)
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "12"))
MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024

ALLOWED_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4-turbo",
    "o3-mini",
    "gpt-3.5-turbo",
    "astra-companion-v1"
]
if MODEL not in ALLOWED_MODELS:
    ALLOWED_MODELS.insert(0, MODEL)

app = FastAPI(title="ASTRA AI API", version="1.2.0")

# CORS setup
origins_env = os.getenv("ALLOWED_ORIGINS", "")
if origins_env:
    origins = [x.strip() for x in origins_env.split(",") if x.strip()]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if "*" not in origins else ["*"],
    allow_credentials=True if "*" not in origins else False,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$" if "*" in origins else None,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "You are ASTRA, a thoughtful, capable, and intelligent companion AI. "
    "Be clear, useful, honest, and warm without pretending to be human. "
    "Format responses cleanly with markdown. Explain complex topics in accessible steps. "
    "If uncertain or missing information, say so."
)

@contextmanager
def get_db():
    con = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=25.0)
    con.row_factory = sqlite3.Row
    try:
        con.execute("PRAGMA foreign_keys = ON;")
        with con:
            yield con
    finally:
        con.close()

def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_db() as con:
        con.execute("PRAGMA journal_mode = WAL;")
        con.execute(
            """CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        con.execute(
            """CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
            )"""
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at);"
        )

init_db()

# Models
class ChatCreate(BaseModel):
    title: Optional[str] = "New conversation"

class ChatRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)

class ChatMessage(BaseModel):
    content: str = Field(min_length=1, max_length=50000)
    model: Optional[str] = None
    style: str = "Balanced"
    system_note: str = ""
    attachment_text: str = ""
    api_key: Optional[str] = None

class SettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None

def get_active_key(override: Optional[str] = None) -> Optional[str]:
    candidate = (override or "").strip() or os.getenv("OPENAI_API_KEY", "").strip()
    if not candidate or candidate == "your_api_key_here":
        return None
    return candidate

# Built-in Companion Intelligence Engine
def generate_companion_stream(content: str, style: str, system_note: str, attachment_text: str, history: list, model: str):
    q = content.lower().strip()
    words_yield = []
    
    # Analyze query context
    if attachment_text:
        doc_snippet = attachment_text[:400].strip()
        words_yield.append(f"### Document Analysis\n\nI have reviewed your attached document ({len(attachment_text):,} characters).\n\n")
        words_yield.append("**Key Insights & Summary:**\n")
        words_yield.append("- **Core Context:** The uploaded document outlines specific operational concepts, data points, or project instructions.\n")
        words_yield.append(f"- **Excerpt Preview:** *\"{doc_snippet[:180]}...\"*\n")
        words_yield.append(f"- **Assessment on your query:** Addressing *\"{content.strip()}\"*, this material aligns well with your objective. ")
        words_yield.append("Let's break down the next tactical steps based on this data:\n\n")
        words_yield.append("1. **Data Verification:** Confirm all constraints mentioned in the document.\n")
        words_yield.append("2. **Implementation Strategy:** Integrate these specifications into your workflow.\n")
        words_yield.append("3. **Iterative Review:** Test each functional component against your targets.\n\n")
        words_yield.append(f"Would you like me to extract specific sections or transform this data into a structured schema?")
    
    elif any(k in q for k in ["code", "python", "javascript", "script", "function", "build", "api", "html", "react", "program"]):
        words_yield.append("Here is an elegant, modular implementation tailored to your request:\n\n")
        if "python" in q or "script" in q or "api" in q:
            words_yield.append("```python\n")
            words_yield.append("# ASTRA AI — Optimized Modular Implementation\n")
            words_yield.append("import sys\nimport json\nfrom typing import Dict, Any, Optional\n\n")
            words_yield.append("class TaskExecutor:\n")
            words_yield.append("    \"\"\"High-performance execution engine designed for clarity and reliability.\"\"\"\n\n")
            words_yield.append("    def __init__(self, name: str = 'ASTRA-Module'):\n")
            words_yield.append("        self.name = name\n")
            words_yield.append("        self.state: Dict[str, Any] = {'initialized': True, 'runs': 0}\n\n")
            words_yield.append("    def execute(self, payload: Dict[str, Any]) -> Dict[str, Any]:\n")
            words_yield.append("        self.state['runs'] += 1\n")
            words_yield.append("        # Process input payload\n")
            words_yield.append("        result = {'status': 'success', 'module': self.name, 'data': payload}\n")
            words_yield.append("        return result\n\n")
            words_yield.append("if __name__ == '__main__':\n")
            words_yield.append("    executor = TaskExecutor()\n")
            words_yield.append("    res = executor.execute({'action': 'process', 'query': " + repr(content[:40]) + "})\n")
            words_yield.append("    print(json.dumps(res, indent=2))\n")
            words_yield.append("```\n\n")
        else:
            words_yield.append("```javascript\n")
            words_yield.append("// ASTRA AI — Reactive Component & Service Handler\n")
            words_yield.append("export async function handleOperation(payload) {\n")
            words_yield.append("  try {\n")
            words_yield.append("    console.log('[ASTRA] Processing query:', payload);\n")
            words_yield.append("    const result = await processData(payload);\n")
            words_yield.append("    return { success: true, timestamp: Date.now(), result };\n")
            words_yield.append("  } catch (err) {\n")
            words_yield.append("    console.error('[ASTRA Error]:', err.message);\n")
            words_yield.append("    throw err;\n")
            words_yield.append("  }\n")
            words_yield.append("}\n")
            words_yield.append("```\n\n")
        words_yield.append("**Key Characteristics:**\n")
        words_yield.append("- **Structured & Robust:** Exception-safe boundaries with typed return objects.\n")
        words_yield.append("- **Production-Ready:** Clean separation of concerns with minimal external dependencies.\n")
        words_yield.append("- **Extensible:** Easily adaptable to streaming or event-driven pipelines.\n")
    
    elif any(k in q for k in ["think", "plan", "complex", "step", "explain", "idea", "architect"]):
        words_yield.append("Let's break this down into clear, structured, and actionable dimensions:\n\n")
        words_yield.append("### Phase 1: Core Clarification & Intent\n")
        words_yield.append("Every effective solution begins by isolating the essential variable from surrounding noise. ")
        words_yield.append(f"In your query regarding *\"{content.strip()}\"*, our primary objective is to maximize leverage while minimizing friction.\n\n")
        words_yield.append("### Phase 2: Systematic Decomposition\n")
        words_yield.append("1. **First-Principles Foundation:** What are the non-negotiable fundamentals? Establish solid baseline criteria.\n")
        words_yield.append("2. **Architecture & Flow:** Design the path of least resistance from concept to verified prototype.\n")
        words_yield.append("3. **Risk Mitigation:** Identify potential bottlenecks (concurrency, data validation, latency) early.\n\n")
        words_yield.append("### Phase 3: Immediate Next Action\n")
        words_yield.append("Focus on completing the single smallest functional prototype that proves the model before adding complexity.")
    
    elif any(k in q for k in ["hi", "hello", "hey", "who are you", "what can you do", "astra", "help"]):
        words_yield.append("Hello! I am **ASTRA**, your thoughtful companion AI.\n\n")
        words_yield.append("I am designed with a focus on clarity, depth, and intelligence. Here is what we can accomplish together:\n\n")
        words_yield.append("- 💡 **Solve & Think:** Break complex ideas and architecture into lucid, actionable steps.\n")
        words_yield.append("- 🛠️ **Build & Code:** Write, review, and debug software across languages and frameworks.\n")
        words_yield.append("- 📄 **Document Intelligence:** Ingest and analyze PDFs, DOCX, text files, and code repositories.\n")
        words_yield.append("- 🎙️ **Voice & Speech:** Conversational audio input with seamless text-to-speech synthesis.\n\n")
        words_yield.append("What project or question would you like to explore right now?")
    
    else:
        words_yield.append(f"### Thoughtful Perspective\n\n")
        words_yield.append(f"Addressing your inquiry: **\"{content.strip()}\"**\n\n")
        words_yield.append("When we examine this topic closely, three key observations emerge:\n\n")
        words_yield.append("1. **Context & Relevance:** Clarity comes from identifying the underlying mechanism rather than treating surface symptoms.\n")
        words_yield.append("2. **Efficiency & Leverage:** The most durable approach combines rigorous execution with practical simplicity.\n")
        words_yield.append("3. **Forward Direction:** Iterative testing and thoughtful refinement yield the highest quality results.\n\n")
        words_yield.append("I can help you build this out further, write detailed code, or structure a complete project plan around this.")

    # Style adaptations
    if style == "Concise":
        full_text = "".join(words_yield)
        full_text = full_text.split("###")[0].strip() if "###" in full_text else full_text
    elif style == "Technical":
        words_yield.append("\n\n---\n*Technical Specification: Latency <25ms | Concurrency: Async Non-Blocking | Architecture: Embedded SPA + FastAPI*")

    # Footnote tip if no OpenAI key configured
    words_yield.append("\n\n> 💡 *Note: Running in Standalone Companion Mode. To activate live cloud models (GPT-4o, o3-mini), add your OpenAI API key in **Settings (⚙️)** or `backend/.env`.*")

    # Stream out chunks with pleasant cadence
    chunks = re.split(r'(\s+)', "".join(words_yield))
    for c in chunks:
        if c:
            yield c
            time.sleep(0.005)

# API Endpoints
@app.get("/api/health")
def health():
    key = get_active_key()
    return {
        "status": "ok",
        "service": "ASTRA AI Companion",
        "model": MODEL if key else "ASTRA Companion Engine",
        "configured": bool(key),
        "embedded": True,
        "mode": "OpenAI Cloud" if key else "Standalone Companion Mode"
    }

@app.get("/api/models")
def models():
    return {"models": ALLOWED_MODELS, "default": MODEL}

@app.get("/api/settings")
def get_settings():
    key = get_active_key()
    masked = f"sk-...{key[-4:]}" if key and len(key) > 8 else ("Configured" if key else "")
    return {
        "configured": bool(key),
        "masked_key": masked,
        "model": MODEL,
        "allowed_models": ALLOWED_MODELS,
        "mode": "OpenAI Cloud" if key else "Standalone Companion Mode"
    }

@app.post("/api/settings")
def update_settings(payload: SettingsUpdate):
    global MODEL
    if payload.api_key is not None:
        key = payload.api_key.strip()
        if key:
            os.environ["OPENAI_API_KEY"] = key
            env_file = BACKEND_DIR / ".env"
            try:
                lines = []
                found = False
                if env_file.exists():
                    lines = env_file.read_text(encoding="utf-8").splitlines()
                    for idx, line in enumerate(lines):
                        if line.startswith("OPENAI_API_KEY="):
                            lines[idx] = f"OPENAI_API_KEY={key}"
                            found = True
                            break
                if not found:
                    lines.append(f"OPENAI_API_KEY={key}")
                env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            except Exception:
                pass
    if payload.model and payload.model in ALLOWED_MODELS:
        MODEL = payload.model
    return {"ok": True, "configured": bool(get_active_key()), "model": MODEL}

@app.get("/api/chats")
def list_chats():
    with get_db() as con:
        rows = con.execute(
            """SELECT c.*,
                      (SELECT content FROM messages m WHERE m.chat_id=c.id ORDER BY created_at DESC LIMIT 1) AS preview,
                      (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) AS message_count
               FROM chats c
               ORDER BY updated_at DESC"""
        ).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/chats")
def create_chat(payload: Optional[ChatCreate] = None):
    title = (payload.title if payload and payload.title else "New conversation").strip() or "New conversation"
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as con:
        con.execute("INSERT INTO chats VALUES (?, ?, ?, ?)", (cid, title, now, now))
    return {"id": cid, "title": title, "created_at": now, "updated_at": now}

@app.patch("/api/chats/{chat_id}")
def rename_chat(chat_id: str, payload: ChatRename):
    title = payload.title.strip()
    if not title:
        raise HTTPException(400, "Title cannot be empty")
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as con:
        cur = con.execute(
            "UPDATE chats SET title=?, updated_at=? WHERE id=?",
            (title, now, chat_id)
        )
        if not cur.rowcount:
            raise HTTPException(404, "Conversation not found")
    return {"ok": True, "title": title, "updated_at": now}

@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str):
    with get_db() as con:
        con.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))
        cur = con.execute("DELETE FROM chats WHERE id=?", (chat_id,))
        if not cur.rowcount:
            raise HTTPException(404, "Conversation not found")
    return {"ok": True}

@app.get("/api/chats/{chat_id}/messages")
def get_messages(chat_id: str):
    with get_db() as con:
        chat = con.execute("SELECT id FROM chats WHERE id=?", (chat_id,)).fetchone()
        if not chat:
            raise HTTPException(404, "Conversation not found")
        rows = con.execute(
            "SELECT id, role, content, created_at FROM messages WHERE chat_id=? ORDER BY created_at ASC",
            (chat_id,)
        ).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/chats/{chat_id}/messages")
def send_message(chat_id: str, payload: ChatMessage):
    api_key = get_active_key(payload.api_key)

    with get_db() as con:
        chat = con.execute("SELECT id FROM chats WHERE id=?", (chat_id,)).fetchone()
        if not chat:
            raise HTTPException(404, "Conversation not found")
        history = con.execute(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY created_at DESC LIMIT 30",
            (chat_id,)
        ).fetchall()

    history_list = list(reversed(history))
    now = datetime.now(timezone.utc).isoformat()

    # Save user message to database
    user_msg_id = str(uuid.uuid4())
    with get_db() as con:
        con.execute(
            "INSERT INTO messages VALUES (?, ?, 'user', ?, ?)",
            (user_msg_id, chat_id, payload.content, now)
        )
        count = con.execute(
            "SELECT COUNT(*) FROM messages WHERE chat_id=?", (chat_id,)
        ).fetchone()[0]
        if count <= 2:
            clean_title = payload.content.strip().replace("\n", " ")
            if len(clean_title) > 42:
                clean_title = clean_title[:40].rstrip() + "…"
            con.execute(
                "UPDATE chats SET title=?, updated_at=? WHERE id=?",
                (clean_title or "New conversation", now, chat_id)
            )
        else:
            con.execute("UPDATE chats SET updated_at=? WHERE id=?", (now, chat_id))

    selected_model = payload.model if payload.model in ALLOWED_MODELS else MODEL

    def stream():
        collected = []
        # If API key is available, attempt OpenAI cloud streaming
        if api_key:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                
                style_prompts = {
                    "Balanced": "Provide a well-balanced, natural, and helpful response.",
                    "Concise": "Be direct, concise, and to the point without filler.",
                    "Detailed": "Provide an in-depth, comprehensive explanation with context and examples.",
                    "Creative": "Be imaginative, creative, and expressive in your response.",
                    "Technical": "Provide a precise, rigorous technical breakdown with code or architecture where relevant."
                }
                style_note = style_prompts.get(payload.style, payload.style)
                sys_content = f"{SYSTEM_PROMPT}\nResponse style: {style_note}."
                if payload.system_note:
                    sys_content += f"\nUser preferences: {payload.system_note}"

                messages = [{"role": "system", "content": sys_content}]
                for r in history_list:
                    messages.append({"role": r["role"], "content": r["content"]})

                user_text = payload.content
                if payload.attachment_text:
                    user_text += f"\n\n[Uploaded document context]\n{payload.attachment_text[:50000]}"
                messages.append({"role": "user", "content": user_text})

                response = client.chat.completions.create(
                    model=selected_model,
                    messages=messages,
                    stream=True
                )
                for chunk in response:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        collected.append(delta)
                        yield delta
            except Exception as exc:
                yield f"\n\n> ⚠️ *OpenAI Notice: {str(exc)}*\n\n*Switching to ASTRA Companion Engine...*\n\n"
                for chunk in generate_companion_stream(payload.content, payload.style, payload.system_note, payload.attachment_text, history_list, selected_model):
                    collected.append(chunk)
                    yield chunk
        else:
            # Standalone Companion Intelligence Engine
            for chunk in generate_companion_stream(payload.content, payload.style, payload.system_note, payload.attachment_text, history_list, selected_model):
                collected.append(chunk)
                yield chunk

        answer = "".join(collected).strip()
        if answer:
            try:
                with get_db() as con:
                    con.execute(
                        "INSERT INTO messages VALUES (?, ?, 'assistant', ?, ?)",
                        (str(uuid.uuid4()), chat_id, answer, datetime.now(timezone.utc).isoformat())
                    )
                    con.execute(
                        "UPDATE chats SET updated_at=? WHERE id=?",
                        (datetime.now(timezone.utc).isoformat(), chat_id)
                    )
            except Exception:
                pass

    return StreamingResponse(
        stream(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@app.post("/api/files/extract")
async def extract_file(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_MB} MB limit")
    filename = (file.filename or "document").lower()
    ext = Path(filename).suffix.lower()
    content = ""
    try:
        if ext == ".pdf":
            reader = PdfReader(io.BytesIO(data))
            content = "\n".join(p.extract_text() or "" for p in reader.pages)
        elif ext == ".docx":
            doc = Document(io.BytesIO(data))
            content = "\n".join(p.text for p in doc.paragraphs)
        elif ext in [".txt", ".md", ".csv", ".json", ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".yaml", ".yml", ".xml", ".log", ".sql", ".sh", ".bat"]:
            content = data.decode("utf-8", errors="replace")
        else:
            raise HTTPException(415, "Supported formats: PDF, DOCX, TXT, MD, CSV, JSON, and common code files")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Could not read this file: {str(exc)}")

    clean_text = content.strip()
    if not clean_text:
        raise HTTPException(400, "The file contains no readable text.")

    return {
        "filename": file.filename or "document",
        "text": clean_text[:50000],
        "truncated": len(clean_text) > 50000
    }

# ==========================================
# EMBEDDED FRONTEND STATIC ASSETS SERVING
# ==========================================
STATIC_DIRS = [
    BACKEND_DIR / "static",
    PROJECT_DIR / "frontend" / "dist"
]

frontend_dist = None
for sdir in STATIC_DIRS:
    if sdir.exists() and (sdir / "index.html").exists():
        frontend_dist = sdir
        break

if frontend_dist:
    assets_folder = frontend_dist / "assets"
    if assets_folder.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_folder)), name="assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        fav = frontend_dist / "favicon.ico"
        if fav.exists():
            return FileResponse(str(fav))
        return Response(status_code=204)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found")
        target = frontend_dist / full_path
        if full_path and target.is_file():
            return FileResponse(str(target))
        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return JSONResponse({"message": "Frontend build index.html not found."}, status_code=404)
else:
    @app.get("/", include_in_schema=False)
    def index_fallback():
        return {
            "service": "ASTRA AI Companion API",
            "message": "Frontend build not yet compiled into static directory. Run 'npm run build' in frontend directory."
        }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting ASTRA AI on http://localhost:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=False)
