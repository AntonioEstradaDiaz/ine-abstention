import { AuthScreen } from "@/components/auth-screen";
import { EXPIRED_RECOVERY_NOTICE } from "@/lib/auth-flow";
export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const expired = (await searchParams).error === "expired";
  return (
    <AuthScreen
      mode="recover"
      initialError={expired}
      initialNotice={expired ? EXPIRED_RECOVERY_NOTICE : ""}
    />
  );
}
