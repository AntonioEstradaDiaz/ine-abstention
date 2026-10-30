import { AuthScreen } from "@/components/auth-screen";
import { EXPIRED_CONFIRMATION_NOTICE } from "@/lib/auth-flow";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const params = await searchParams;
  const expired = params.error === "confirmation";
  return (
    <AuthScreen
      mode="login"
      initialError={expired}
      allowResend={expired}
      initialNotice={
        expired
          ? EXPIRED_CONFIRMATION_NOTICE
          : params.updated === "1"
            ? "Contraseña actualizada. Inicia sesión con tu nueva contraseña."
            : ""
      }
    />
  );
}
