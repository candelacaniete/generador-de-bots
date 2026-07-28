import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-full w-full max-w-md flex-1 items-center justify-center px-4 py-12 text-sm text-slate-500">
          Cargando…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
