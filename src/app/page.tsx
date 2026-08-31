import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/constants";

export default async function Home() {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value) {
    redirect("/dashboard");
  }
  redirect("/login");
}
