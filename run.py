"""
ASTRA AI — Embedded Full-Stack Companion AI
Launches both Frontend and Backend on a single unified port: http://localhost:8000
"""
import os
import sys
import time
import threading
import subprocess
from pathlib import Path
import webbrowser

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
STATIC_DIR = BACKEND_DIR / "static"

def open_browser(url: str):
    time.sleep(1.2)
    try:
        webbrowser.open(url)
    except Exception:
        pass

def main():
    os.chdir(BACKEND_DIR)
    
    # Ensure static frontend exists
    if not STATIC_DIR.exists() or not (STATIC_DIR / "index.html").exists():
        print("Embedded frontend assets missing. Building frontend...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, check=True, shell=True)
            import shutil
            shutil.copytree(FRONTEND_DIR / "dist", STATIC_DIR, dirs_exist_ok=True)
            print("Frontend built and embedded successfully!")
        except Exception as e:
            print(f"Notice: Could not compile frontend automatically: {e}")

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    url = f"http://localhost:{port}"

    print("=" * 64)
    print("  ✦ ASTRA AI — Embedded Companion AI")
    print(f"  ✦ Web Application URL: {url}")
    print("  ✦ Frontend & Backend Unified • SQLite Concurrency Active")
    print("=" * 64)

    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    try:
        import uvicorn
        uvicorn.run("main:app", host=host, port=port, reload=False)
    except ImportError:
        print("\nERROR: Required Python packages are not installed.")
        print("Please run: pip install -r backend/requirements.txt")
        sys.exit(1)

if __name__ == "__main__":
    main()
