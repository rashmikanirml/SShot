import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type CaptureMode = "area" | "fullscreen" | "window";
type Tool = "arrow" | "text" | "blur";

type Point = {
  x: number;
  y: number;
};

type ArrowAnnotation = {
  id: string;
  kind: "arrow";
  from: Point;
  to: Point;
};

type TextAnnotation = {
  id: string;
  kind: "text";
  at: Point;
  content: string;
};

type BlurAnnotation = {
  id: string;
  kind: "blur";
  at: Point;
  width: number;
  height: number;
};

type Annotation = ArrowAnnotation | TextAnnotation | BlurAnnotation;

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
  const [tool, setTool] = useState<Tool>("arrow");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [ocrText, setOcrText] = useState("No OCR run yet.");

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
      setAnnotations([]);
      setStatus(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Capture failed: ${detail}`);
    } finally {
      setBusy(false);
    }
  }

  function createArrow(point: Point): ArrowAnnotation {
    return {
      id: crypto.randomUUID(),
      kind: "arrow",
      from: point,
      to: {
        x: Math.min(95, point.x + 20),
        y: Math.max(5, point.y - 12),
      },
    };
  }

  function createText(point: Point): TextAnnotation {
    const text = window.prompt("Text annotation", "Review this section")?.trim();

    return {
      id: crypto.randomUUID(),
      kind: "text",
      at: point,
      content: text && text.length > 0 ? text : "Note",
    };
  }

  function createBlur(point: Point): BlurAnnotation {
    return {
      id: crypto.randomUUID(),
      kind: "blur",
      at: {
        x: Math.max(4, point.x - 10),
        y: Math.max(4, point.y - 8),
      },
      width: 22,
      height: 16,
    };
  }

  function addAnnotation(event: React.MouseEvent<HTMLDivElement>) {
    if (!lastCapture || !active) {
      return;
    }

    const targetRect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - targetRect.left) / targetRect.width) * 100,
      y: ((event.clientY - targetRect.top) / targetRect.height) * 100,
    };

    const next: Annotation =
      tool === "arrow"
        ? createArrow(point)
        : tool === "text"
          ? createText(point)
          : createBlur(point);

    setAnnotations((current) => [...current, next]);
  }

  function undoAnnotation() {
    setAnnotations((current) => current.slice(0, -1));
  }

  function clearAnnotations() {
    setAnnotations([]);
  }

  function runOcrStub() {
    if (!lastCapture) {
      return;
    }

    setOcrText(
      `OCR preview for ${lastCapture.mode}: extracted text pipeline is next and will read directly from ${lastCapture.savedPath}.`
    );
  }

  function runScrollCaptureStub() {
    setStatus(
      "Scrolling capture workflow queued. Stitching engine integration is in the next backend slice."
    );
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
        <header className="panel-header">
          <h2>Annotation Studio</h2>
        </header>

        <div className="annotator-controls">
          <button
            type="button"
            className={tool === "arrow" ? "tool tool-active" : "tool"}
            onClick={() => setTool("arrow")}
            disabled={!lastCapture}
          >
            Arrow
          </button>
          <button
            type="button"
            className={tool === "text" ? "tool tool-active" : "tool"}
            onClick={() => setTool("text")}
            disabled={!lastCapture}
          >
            Text
          </button>
          <button
            type="button"
            className={tool === "blur" ? "tool tool-active" : "tool"}
            onClick={() => setTool("blur")}
            disabled={!lastCapture}
          >
            Blur
          </button>
          <button type="button" className="tool" onClick={undoAnnotation} disabled={!annotations.length}>
            Undo
          </button>
          <button type="button" className="tool" onClick={clearAnnotations} disabled={!annotations.length}>
            Clear
          </button>
        </div>

        <div
          className={lastCapture ? "annotator-surface" : "annotator-surface annotator-empty"}
          onClick={addAnnotation}
          role="presentation"
        >
          {lastCapture ? (
            <>
              <p className="surface-label">Click anywhere to place a {tool} annotation.</p>
              <svg className="overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <marker
                    id="arrow-tip"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 z" fill="#0d5db8" />
                  </marker>
                </defs>

                {annotations.map((item) => {
                  if (item.kind === "arrow") {
                    return (
                      <line
                        key={item.id}
                        x1={item.from.x}
                        y1={item.from.y}
                        x2={item.to.x}
                        y2={item.to.y}
                        stroke="#0d5db8"
                        strokeWidth="1.2"
                        markerEnd="url(#arrow-tip)"
                      />
                    );
                  }

                  if (item.kind === "blur") {
                    return (
                      <rect
                        key={item.id}
                        x={item.at.x}
                        y={item.at.y}
                        width={item.width}
                        height={item.height}
                        fill="rgba(43, 54, 66, 0.45)"
                      />
                    );
                  }

                  return (
                    <text
                      key={item.id}
                      x={item.at.x}
                      y={item.at.y}
                      fill="#142f4d"
                      fontSize="3.5"
                      fontWeight="600"
                    >
                      {item.content}
                    </text>
                  );
                })}
              </svg>
            </>
          ) : (
            <p className="empty-state">Capture an image first to start annotating.</p>
          )}
        </div>
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

        <div className="workflow-row">
          <button type="button" className="tool" onClick={runOcrStub} disabled={!lastCapture}>
            Run OCR
          </button>
          <button type="button" className="tool" onClick={runScrollCaptureStub} disabled={!active}>
            Scrolling Capture
          </button>
        </div>
        <p className="ocr-preview">{ocrText}</p>
      </section>
    </main>
  );
}

export default App;
