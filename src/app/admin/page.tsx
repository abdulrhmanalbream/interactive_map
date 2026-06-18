import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }
  return <AdminDashboard />;
}
