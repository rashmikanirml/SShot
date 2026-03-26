import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type CaptureMode = "area" | "fullscreen" | "window";

type CaptureResult = {
  mode: CaptureMode;
  message: string;
  savedPath: string;
  timestamp: string;
};

function App() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking app focus...");
  const [lastCapture, setLastCapture] = useState<CaptureResult | null>(null);

  const windowHandle = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    let mounted = true;

    const syncState = async () => {
      const isFocused = await windowHandle.isFocused();
      await invoke("set_window_active", { active: isFocused });

      if (!mounted) {
        return;
      }

      setActive(isFocused);
      setStatus(
        isFocused
          ? "Ready. Capture tools are unlocked while this window is active."
          : "Capture paused. Focus this window to unlock tools."
      );
    };

    const unlistenFocus = windowHandle.onFocusChanged(async ({ payload }) => {
      await invoke("set_window_active", { active: payload });
      if (!mounted) {
        return;
      }

      setActive(payload);
      setStatus(
        payload
          ? "Ready. Capture tools are unlocked while this window is active."
          : "Capture paused. Focus this window to unlock tools."
      );
    });

    syncState().catch(() => {
      if (!mounted) {
        return;
      }
      setStatus("Unable to read focus state. Reopen the app window and try again.");
    });

    return () => {
      mounted = false;
      unlistenFocus.then((fn) => fn()).catch(() => undefined);
    };
  }, [windowHandle]);

  async function runCapture(mode: CaptureMode) {
    if (!active || busy) {
      return;
    }

    setBusy(true);
    setStatus(`Starting ${mode} capture...`);

    try {
      const command =
        mode === "area"
          ? "capture_area"
          : mode === "fullscreen"
            ? "capture_fullscreen"
            : "capture_window";

      const result = await invoke<CaptureResult>(command);
      setLastCapture(result);
      setStatus(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Capture failed: ${detail}`);
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Screen Capture Suite</p>
        <h1>Capture Workspace</h1>
        <p className="subtitle">
          Enterprise screenshot controls with strict active-window policy.
        </p>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Capture Modes</h2>
          <span className={active ? "badge badge-ready" : "badge badge-paused"}>
            {active ? "Window Active" : "Window Inactive"}
          </span>
        </header>

        <p className="status">{status}</p>

        <div className="actions">
          <button
            type="button"
            onClick={() => runCapture("area")}
            disabled={!active || busy}
          >
            Area Capture
          </button>
          <button
            type="button"
            onClick={() => runCapture("fullscreen")}
            disabled={!active || busy}
          >
            Full Screen
          </button>
          <button
            type="button"
            onClick={() => runCapture("window")}
            disabled={!active || busy}
          >
            Window Capture
          </button>
        </div>
      </section>

      <section className="panel panel-secondary">
        <h2>Implementation Status</h2>
        <ul className="feature-list">
          <li>Annotation pipeline scaffolded (arrow, text, blur placeholders).</li>
          <li>OCR module scheduled for next implementation slice.</li>
          <li>Scrolling capture engine stubbed for phased delivery.</li>
        </ul>
      </section>

      <section className="panel panel-secondary">
        <h2>Last Capture</h2>
        {lastCapture ? (
          <div className="capture-meta">
            <p>
              <strong>Mode:</strong> {lastCapture.mode}
            </p>
            <p>
              <strong>Saved Path:</strong> {lastCapture.savedPath}
            </p>
            <p>
              <strong>Time:</strong> {lastCapture.timestamp}
            </p>
          </div>
        ) : (
          <p className="empty-state">No capture yet in this session.</p>
        )}
      </section>
    </main>
  );
}

export default App;
