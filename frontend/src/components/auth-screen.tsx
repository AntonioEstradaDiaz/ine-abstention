"use client";
import { useState, useRef, useLayoutEffect, type FormEvent } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  UserRound,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import { authBrowser } from "@/lib/supabase/browser";
import { authConfigured } from "@/lib/supabase/config";
type Mode = "login" | "register" | "recover" | "reset";
export function AuthScreen({
  mode,
  initialNotice = "",
  initialError = false,
}: {
  mode: Mode;
  initialNotice?: string;
  initialError?: boolean;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const card = cardRef.current;
    if (!frame || !card) return;
    const fit = () => {
      const scale = Math.min(
        1,
        window.innerWidth <= 820 ? frame.clientWidth / card.offsetWidth : 1,
        frame.clientHeight / card.offsetHeight,
      );
      card.style.setProperty("--auth-fit-scale", String(scale));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(card);
    fit();
    return () => observer.disconnect();
  }, []);
  const [visible, setVisible] = useState(false),
    [confirmVisible, setConfirmVisible] = useState(false),
    [remember, setRemember] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(initialNotice),
    [failed, setFailed] = useState(initialError),
    [info, setInfo] = useState<"privacy" | "help" | null>(null);
  const configured = authConfigured();
  const register = mode === "register",
    passwordMode = register || mode === "reset";
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
        if (error)
          throw new Error(
            error.code === "email_not_confirmed"
              ? "Confirma tu correo antes de iniciar sesión."
              : error.status === 429
                ? "Demasiados intentos. Espera unos minutos."
                : "No pudimos iniciar sesión. Revisa tu correo y contraseña.",
          );
        router.replace("/");
        router.refresh();
      } else if (register) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/callback`,
            data: {
              first_name: String(fields.get("first_name") ?? "").trim(),
              last_name: String(fields.get("last_name") ?? "").trim(),
            },
          },
        });
        if (error)
          throw new Error(
            error.status === 429
              ? "Se alcanzó el límite de registros. Intenta más tarde."
              : "No se pudo crear la cuenta. Revisa los datos o contacta al administrador.",
          );
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else
          setNotice(
            "Si el correo permite el registro, recibirás un enlace para confirmar tu cuenta. Revisa también la carpeta de spam.",
          );
      } else if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });
        if (error)
          throw new Error(
            "No se pudo solicitar la recuperación. Intenta más tarde.",
          );
        setNotice(
          "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.",
        );
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
  return (
    <main className={`auth-page auth-${mode}`}>
      <div className="auth-fit-frame" ref={frameRef}>
        <section
          ref={cardRef}
          className="auth-card"
          aria-label="Acceso al dashboard"
        >
          <aside className="auth-art" aria-label="Inteligencia electoral">
            <div className="auth-logo">
              <img
                src="/auth/ine-logo.png"
                alt="INE · Instituto Nacional Electoral"
              />
            </div>
            <div className="auth-visual">
              <img
                className="auth-illustration"
                src="/auth/account-illustration-adapted.png"
                alt="Ilustración de una mujer con una tableta junto a un teléfono con acceso seguro al dashboard"
              />
            </div>
            <div className="auth-art-caption">
              <h2>
                {register ? (
                  <>
                    Tu cuenta, <em>tu acceso</em>
                  </>
                ) : (
                  <>
                    Tu información,
                    <br />
                    <em>en un solo lugar</em>
                  </>
                )}
              </h2>
              <p>
                {register
                  ? "Regístrate y comienza a explorar tu dashboard."
                  : "Accede a tu dashboard de forma sencilla y segura."}
              </p>
            </div>
          </aside>
          <div className="auth-panel">
            <header>
              <h1>
                {register
                  ? "Crea tu cuenta"
                  : mode === "recover"
                    ? "Recupera tu acceso"
                    : mode === "reset"
                      ? "Nueva contraseña"
                      : "Bienvenido al dashboard"}
              </h1>
              <p>
                {register
                  ? "Completa tus datos para registrarte."
                  : mode === "recover"
                    ? "Te enviaremos un enlace a tu correo."
                    : mode === "reset"
                      ? "Elige una contraseña segura para continuar."
                      : "Inicia sesión o crea una cuenta para continuar."}
              </p>
            </header>
            {(mode === "login" || register) && (
              <nav className="auth-tabs" aria-label="Tipo de acceso">
                <Link
                  href="/login"
                  aria-current={!register ? "page" : undefined}
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/registro"
                  aria-current={register ? "page" : undefined}
                >
                  Registrarse
                </Link>
              </nav>
            )}
            {!configured && (
              <p className="auth-setup" role="status">
                El administrador debe configurar Supabase para habilitar el
                acceso.
              </p>
            )}
            <form onSubmit={submit}>
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
              <button
                className="auth-primary"
                type="submit"
                disabled={busy || !configured}
              >
                {busy
                  ? "Procesando…"
                  : register
                    ? "Crear cuenta"
                    : mode === "recover"
                      ? "Enviar enlace"
                      : mode === "reset"
                        ? "Guardar contraseña"
                        : "Iniciar sesión"}
              </button>
            </form>
            {mode === "login" ? (
              <div className="auth-create">
                <p>¿Aún no tienes cuenta?</p>
                <Link href="/registro">Crear cuenta</Link>
              </div>
            ) : (
              <p className="auth-back">
                {register ? "¿Ya tienes una cuenta? " : ""}
                <Link href="/login">
                  {register ? (
                    "Inicia sesión"
                  ) : (
                    <>
                      <ArrowLeft size={15} /> Volver a iniciar sesión
                    </>
                  )}
                </Link>
              </p>
            )}
            <footer>
              <button onClick={() => setInfo("privacy")}>
                Aviso de privacidad
              </button>
              <span>|</span>
              <button onClick={() => setInfo("help")}>Ayuda</button>
            </footer>
          </div>
        </section>
      </div>
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
              {info === "privacy" ? "Aviso de privacidad" : "¿Necesitas ayuda?"}
            </Dialog.Title>
            {info === "privacy" ? (
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
