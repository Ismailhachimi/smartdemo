"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Spinner } from "@/components/ui";
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
      setError("Ce lien est incomplet.");
      return;
    }
    api("/auth/verify", { method: "POST", json: { token } })
      .then(() => router.replace("/activity"))
      .catch((err: Error) => setError(err.message));
  }, [params, router]);

  if (!error) {
    return (
      <div className="text-center">
        <Spinner className="py-4" />
        <p className="text-ink-2">Connexion…</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="display text-[28px]">Lien invalide</h1>
      <p className="mt-2 text-ink-2">{error} Les liens de connexion ne servent qu&apos;une fois et expirent après 15 minutes.</p>
      <Link href="/login" className="btn-primary mt-8 h-10 w-full">
        Demander un nouveau lien
      </Link>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<Spinner />}>
        <Verify />
      </Suspense>
    </AuthLayout>
  );
}
