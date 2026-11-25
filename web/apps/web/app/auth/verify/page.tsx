"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Logo, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get("token");
    if (!token) {
      setError("Lien incomplet.");
      return;
    }
    api("/auth/verify", { method: "POST", json: { token } })
      .then(() => router.replace("/videos"))
      .catch((err: Error) => setError(err.message));
  }, [params, router]);

  if (!error) return <Spinner />;
  return (
    <div className="card p-6 text-center">
      <h1 className="text-lg font-semibold">Connexion impossible</h1>
      <p className="mt-2 text-sm text-ink-2">{error}</p>
      <Link href="/login" className="btn-primary mt-5 w-full">
        Demander un nouveau lien
      </Link>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo href="/login" />
        </div>
        <Suspense fallback={<Spinner />}>
          <Verify />
        </Suspense>
      </div>
    </main>
  );
}
