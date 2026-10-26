import { AuthScreen } from "@/components/auth-screen";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthScreen
      mode="login"
      initialError={params.error === "confirmation"}
      initialNotice={
        params.error === "confirmation"
          ? "El enlace no es válido o ya expiró. Solicita uno nuevo o inicia sesión si ya confirmaste tu correo."
          : params.updated === "1"
            ? "Contraseña actualizada. Inicia sesión con tu nueva contraseña."
            : ""
      }
    />
  );
}
