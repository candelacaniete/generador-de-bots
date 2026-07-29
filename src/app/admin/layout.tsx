import { redirect } from "next/navigation";
import { getAuthUser, isAdminEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Defensa en profundidad: aunque el middleware falle, esta layout
 * no renderiza children sin re-validar admin en el server.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    redirect("/login?error=admin_only");
  }

  return children;
}
