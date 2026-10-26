import { redirect } from "next/navigation";
import { authServer } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const supabase = await authServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");
  return <Dashboard preview={process.env.PULSO_PREVIEW === "1"} />;
}
