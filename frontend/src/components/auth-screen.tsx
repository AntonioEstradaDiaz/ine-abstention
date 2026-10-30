"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { authBrowser } from "@/lib/supabase/browser";
import { authConfigured } from "@/lib/supabase/config";
import {
  RESEND_COOLDOWN_MS,
  RESEND_NEEDS_EMAIL,
  loginErrorNotice,
  recoverNotice,
  registerNotice,
  resendLabel,
  resendNotice,
  resendWaitSeconds,
  type AuthErrorLike,
  type AuthNotice,
} from "@/lib/auth-flow";
type Mode = "login" | "register" | "recover" | "reset";
export function AuthScreen({
  mode,
  initialNotice = "",
  initialError = false,
  allowResend = false,
}: {
  mode: Mode;
  initialNotice?: string;
  initialError?: boolean;
  /** Offer "Reenviar confirmación" from the start (expired confirmation link). */
  allowResend?: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false),
    [confirmVisible, setConfirmVisible] = useState(false),
    [remember, setRemember] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(initialNotice),
    [failed, setFailed] = useState(initialError),
    [info, setInfo] = useState<"privacy" | "terms" | "help" | null>(null),
    // Resend is offered after registering, after "email not confirmed" and on expired links.
    [resendOffered, setResendOffered] = useState(allowResend),
    [resendEmail, setResendEmail] = useState(""),
    [resendAt, setResendAt] = useState(0),
    [now, setNow] = useState(0),
    [resending, setResending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const configured = authConfigured();
  const register = mode === "register",
    passwordMode = register || mode === "reset";
  const resendWait = resendWaitSeconds(resendAt, now);
  useEffect(() => {
    if (resendWait <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendWait]);
  const show = ({ text, error }: AuthNotice) => {
    setFailed(error);
    setNotice(text);
  };
  async function resend() {
    if (resending || resendWait > 0) return;
    const typed = form.current?.elements.namedItem("email");
    const email =
      resendEmail ||
      (typed instanceof HTMLInputElement ? typed.value.trim() : "");
    if (!email) return show(RESEND_NEEDS_EMAIL);
    setResending(true);
    try {
      const { error } = await authBrowser()
        .auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        })
        .catch((thrown: AuthErrorLike) => ({ error: thrown }));
      show(resendNotice(error));
      const started = Date.now();
      setNow(started);
      setResendAt(started + RESEND_COOLDOWN_MS);
    } finally {
      setResending(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setNotice("");
    setFailed(false);
    const fields = new FormData(event.currentTarget),
      email = String(fields.get("email") ?? "").trim(),
      password = String(fields.get("password") ?? "");
    if (passwordMode && password !== fields.get("confirm")) {
      setFailed(true);
      setNotice("Las contraseñas no coinciden.");
      return;
    }
    if (!configured) {
      setFailed(true);
      setNotice(
        "El acceso aún no está configurado. Contacta al administrador del dashboard.",
      );
      return;
    }
    setBusy(true);
    try {
      const supabase = authBrowser();
      const origin = window.location.origin;
      if (mode === "login") {
        document.cookie = `pulso-remember=${remember ? "1" : "0"}; Path=/; SameSite=Lax${remember ? "; Max-Age=31536000" : ""}${window.location.protocol === "https:" ? "; Secure" : ""}`;
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          const result = loginErrorNotice(error);
          show(result);
          if (result.canResend) {
            setResendEmail(email);
            setResendOffered(true);
          }
          return;
        }
        router.replace("/");
        router.refresh();
      } else if (register) {
        // Email links go to /auth/confirm (token_hash), which works on any device.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/confirm`,
            data: {
              first_name: String(fields.get("first_name") ?? "").trim(),
              last_name: String(fields.get("last_name") ?? "").trim(),
            },
          },
        });
        if (!error && data.session) {
          router.replace("/");
          router.refresh();
          return;
        }
        const result = registerNotice(error);
        show(result);
        if (result.canResend) {
          setResendEmail(email);
          setResendOffered(true);
        }
      } else if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/confirm`,
        });
        show(recoverNotice(error));
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error)
          throw new Error(
            "No se pudo actualizar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.",
          );
        await supabase.auth.signOut();
        router.replace("/login?updated=1");
        router.refresh();
      }
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof Error
          ? error.message
          : "No fue posible conectar. Intenta nuevamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const copy = {
    login: {
      eyebrow: "Acceso a la plataforma",
      title: "Bienvenido de nuevo",
      text: "Ingresa tus datos para continuar.",
      action: "Iniciar sesión",
    },
    register: {
      eyebrow: "Registro en la plataforma",
      title: "Crea tu cuenta",
      text: "Completa tus datos para registrarte.",
      action: "Crear cuenta",
    },
    recover: {
      eyebrow: "Recuperación de acceso",
      title: "Recupera tu contraseña",
      text: "Te enviaremos un enlace a tu correo.",
      action: "Enviar enlace",
    },
    reset: {
      eyebrow: "Nueva contraseña",
      title: "Elige tu contraseña",
      text: "Usa una contraseña segura para continuar.",
      action: "Guardar contraseña",
    },
  }[mode];
  return (
    <main className={`auth-page auth-${mode}`}>
      <section className="auth-card" aria-label="Acceso al dashboard">
        <aside className="auth-hero" aria-label="Bienvenida del INE">
          <img
            className="auth-logo"
            src="/design-top/logo-ine.png"
            alt="INE · Instituto Nacional Electoral"
            width={2172}
            height={724}
          />
          <div className="auth-hero-text">
            <h2>
              Tu participación <span>hace la diferencia.</span>
            </h2>
            <p>Datos y análisis para construir un México más informado.</p>
          </div>
          <img
            className="auth-illustration"
            src="/auth/participacion-ciudadana.webp"
            alt=""
            width={1535}
            height={1024}
          />
        </aside>
        <div className="auth-panel">
          <span className="auth-decor" aria-hidden="true" />
          <header>
            <span className="auth-eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.text}</p>
          </header>
          {!configured && (
            <p className="auth-setup" role="status">
              El administrador debe configurar Supabase para habilitar el
              acceso.
            </p>
          )}
          <form ref={form} onSubmit={submit}>
            {register && (
              <div className="auth-name-row">
                <label>
                  Nombre(s)
                  <span className="auth-input">
                    <UserRound />
                    <input
                      name="first_name"
                      autoComplete="given-name"
                      placeholder="Tu nombre"
                      required
                      maxLength={80}
                    />
                  </span>
                </label>
                <label>
                  Apellidos
                  <span className="auth-input">
                    <UserRound />
                    <input
                      name="last_name"
                      autoComplete="family-name"
                      placeholder="Tus apellidos"
                      required
                      maxLength={100}
                    />
                  </span>
                </label>
              </div>
            )}
            {mode !== "reset" && (
              <label>
                Correo electrónico
                <span className="auth-input">
                  <Mail />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@correo.com"
                    required
                    maxLength={254}
                  />
                </span>
              </label>
            )}
            {mode !== "recover" && (
              <label>
                Contraseña
                <span className="auth-input">
                  <LockKeyhole />
                  <input
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="••••••••"
                    minLength={passwordMode ? 8 : 1}
                    required
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    aria-label={
                      visible ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {visible ? <EyeOff /> : <Eye />}
                  </button>
                </span>
                {passwordMode && <small>Usa al menos 8 caracteres.</small>}
              </label>
            )}
            {passwordMode && (
              <label>
                Confirmar contraseña
                <span className="auth-input">
                  <LockKeyhole />
                  <input
                    name="confirm"
                    type={confirmVisible ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    minLength={8}
                    required
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmVisible(!confirmVisible)}
                    aria-label={
                      confirmVisible
                        ? "Ocultar confirmación"
                        : "Mostrar confirmación"
                    }
                  >
                    {confirmVisible ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </label>
            )}
            {mode === "login" && (
              <div className="auth-options">
                <label>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Recordarme
                </label>
                <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
              </div>
            )}
            {register && (
              <label className="auth-consent">
                <input type="checkbox" name="privacy" required />
                <span>
                  He leído y acepto el{" "}
                  <button type="button" onClick={() => setInfo("privacy")}>
                    aviso de privacidad
                  </button>
                  .
                </span>
              </label>
            )}
            {notice && (
              <p
                className={`auth-notice ${failed ? "error" : "success"}`}
                role={failed ? "alert" : "status"}
              >
                {!failed && <Check size={18} />} {notice}
              </p>
            )}
            {resendOffered && (mode === "login" || register) && (
              <button
                className="auth-resend"
                type="button"
                onClick={resend}
                aria-disabled={resending || resendWait > 0}
              >
                {resending ? "Enviando…" : resendLabel(resendWait)}
              </button>
            )}
            <button
              className="auth-primary"
              type="submit"
              disabled={busy || !configured}
            >
              {busy ? "Procesando…" : copy.action}
              {!busy && <ArrowRight aria-hidden="true" />}
            </button>
          </form>
          <div className="auth-divider" aria-hidden="true">
            <span>o</span>
          </div>
          {mode === "login" ? (
            <p className="auth-switch">
              ¿No tienes una cuenta? <Link href="/registro">Crear cuenta</Link>
            </p>
          ) : register ? (
            <p className="auth-switch">
              ¿Ya tienes una cuenta? <Link href="/login">Inicia sesión</Link>
            </p>
          ) : (
            <p className="auth-switch">
              <Link href="/login">
                <ArrowLeft size={15} aria-hidden="true" /> Volver a iniciar
                sesión
              </Link>
            </p>
          )}
          <p className="auth-secure">
            <ShieldCheck aria-hidden="true" />
            Acceso seguro a tu información
          </p>
          <p className="auth-independent">Prototipo independiente · No es una plataforma oficial del INE</p>
          <footer>
            <button onClick={() => setInfo("privacy")}>
              Aviso de privacidad
            </button>
            <span aria-hidden="true">|</span>
            <button onClick={() => setInfo("terms")}>Términos de uso</button>
            <span aria-hidden="true">|</span>
            <button onClick={() => setInfo("help")}>Ayuda</button>
          </footer>
        </div>
      </section>
      <Dialog.Root
        open={!!info}
        onOpenChange={(open) => {
          if (!open) setInfo(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="auth-info-backdrop" />
          <Dialog.Content className="auth-info" aria-describedby={undefined}>
            <button
              className="auth-info-close"
              onClick={() => setInfo(null)}
              aria-label="Cerrar información"
            >
              <X />
            </button>
            <Dialog.Title>
              {info === "privacy"
                ? "Aviso de privacidad"
                : info === "terms"
                  ? "Términos de uso"
                  : "¿Necesitas ayuda?"}
            </Dialog.Title>
            {info === "terms" ? (
              <>
                <p>
                  Pulso electoral es un prototipo analítico con datos abiertos
                  del INE. Sus estimaciones son experimentales, no son un
                  producto oficial del INE y no deben usarse para decisiones
                  operativas.
                </p>
                <p>
                  Tu cuenta es personal. No compartas tu contraseña y cierra
                  sesión al terminar en equipos compartidos.
                </p>
              </>
            ) : info === "privacy" ? (
              <>
                <p>
                  Este prototipo utiliza tu nombre, apellidos y correo para
                  crear tu cuenta y gestionar el acceso. La contraseña se
                  procesa a través de Supabase Auth y no se guarda en el
                  navegador ni se envía al asistente de IA.
                </p>
                <p>
                  El responsable del despliegue debe publicar su aviso de
                  privacidad completo y los medios de contacto antes de abrir el
                  registro al público.
                </p>
                <p><Link href="/privacidad" target="_blank" rel="noopener noreferrer">Consultar el borrador de privacidad (abre una nueva pestaña)</Link></p>
              </>
            ) : (
              <>
                <p>
                  Confirma tu correo antes de iniciar sesión. Si olvidaste tu
                  contraseña, solicita un enlace desde «¿Olvidaste tu
                  contraseña?» y revisa tu carpeta de spam.
                </p>
                <p>
                  Si el acceso no está disponible o un enlace expiró, contacta
                  al administrador de esta instalación.
                </p>
                <p><Link href="/soporte" target="_blank" rel="noopener noreferrer">Consultar ayuda y soporte (abre una nueva pestaña)</Link></p>
              </>
            )}
            <button className="auth-primary" onClick={() => setInfo(null)}>
              Entendido
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
