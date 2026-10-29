"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  ChevronRight,
  Database,
  Info,
  Sparkles,
  WifiOff,
} from "lucide-react";

export type NoticeKind = "forecast" | "risk" | "data" | "info" | "error";
export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  text: string;
  when?: string;
  view?: string;
}
const icons = {
  forecast: Sparkles,
  risk: AlertTriangle,
  data: Database,
  info: Info,
  error: WifiOff,
};
const STORAGE_KEY = "pulso-notifications-read";

// Read state is a per-browser convenience; the page works without storage.
function loadRead(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
function saveRead(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    /* Storage unavailable: read state lasts only for this visit. */
  }
}

export function Notifications({
  notices,
  bellIcon,
  dotIcon,
  onOpenView,
}: {
  notices: Notice[];
  bellIcon: string;
  dotIcon: string;
  onOpenView: (view: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => setRead(loadRead()), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const unread = notices.filter((n) => !read.includes(n.id));
  const markRead = (ids: string[]) => {
    const next = [...new Set([...read, ...ids])];
    setRead(next);
    saveRead(next);
  };
  return (
    <div className="notifications" ref={root} data-name="Notificaciones">
      <button
        type="button"
        className="notifications-trigger"
        aria-label={
          unread.length
            ? `Notificaciones, ${unread.length} sin leer`
            : "Notificaciones"
        }
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <img src={bellIcon} alt="" width={20} height={20} />
        {unread.length > 0 && (
          <span className="notifications-badge" aria-hidden="true">
            <img src={dotIcon} alt="" />
            <b>{unread.length > 9 ? "9+" : unread.length}</b>
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="notifications-panel"
          role="dialog"
          aria-label="Notificaciones"
        >
          <header>
            <div>
              <strong>Notificaciones</strong>
              <span>
                {unread.length ? `${unread.length} sin leer` : "Estás al día"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => markRead(notices.map((n) => n.id))}
              disabled={!unread.length}
            >
              <CheckCheck size={15} aria-hidden="true" />
              Marcar como leídas
            </button>
          </header>
          {notices.length ? (
            <ul>
              {notices.map((n) => {
                const Icon = icons[n.kind];
                const isUnread = !read.includes(n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      data-kind={n.kind}
                      data-unread={isUnread}
                      onClick={() => {
                        markRead([n.id]);
                        if (n.view) {
                          onOpenView(n.view);
                          setOpen(false);
                        }
                      }}
                    >
                      <span className="notifications-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="notifications-text">
                        <strong>{n.title}</strong>
                        <span>{n.text}</span>
                        {n.when && <small>{n.when}</small>}
                      </span>
                      {isUnread && (
                        <i
                          className="notifications-dot"
                          aria-label="Sin leer"
                        />
                      )}
                      {n.view && (
                        <ChevronRight
                          className="notifications-go"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="notifications-empty">Sin notificaciones por ahora.</p>
          )}
          <footer>
            Avisos generados con los datos cargados en el tablero.
          </footer>
        </div>
      )}
    </div>
  );
}
