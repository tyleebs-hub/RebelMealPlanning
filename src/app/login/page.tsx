import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Leber Family Meals</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Enter your password.
      </p>
      <LoginForm next={next ?? "/"} />
    </main>
  );
}
