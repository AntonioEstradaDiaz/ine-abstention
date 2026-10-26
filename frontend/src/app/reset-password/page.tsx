import { redirect } from "next/navigation";
import { authServer } from "@/lib/supabase/server";
import { AuthScreen } from "@/components/auth-screen";
export default async function ResetPage() {
  const supabase = await authServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/recuperar");
  return <AuthScreen mode="reset" />;
}
