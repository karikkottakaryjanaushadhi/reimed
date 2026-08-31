import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" && sp.from.startsWith("/") ? sp.from : "/dashboard";
  return <LoginForm from={from} />;
}
