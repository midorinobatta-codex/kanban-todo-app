'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await getSupabaseClient().auth.getSession();

      if (!mounted) return;

      if (data.session) {
        router.replace('/');
        return;
      }

      setCheckingSession(false);
    };

    void checkSession();

    const {
      data: { subscription }
    } = getSupabaseClient().auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (session) {
        router.replace('/');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setError(null);

    const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace('/');
    setLoading(false);
  };

  if (checkingSession) {
    return <p className="p-6 text-sm text-slate-500">認証状態を確認中...</p>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">ログイン</h1>
        <p className="mt-2 text-sm text-slate-600">Supabase Auth のメールログインでカンバンにアクセスします。</p>

        <form onSubmit={onSubmit} className="mt-6 grid gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="メールアドレス"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="パスワード"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            disabled={loading}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        {error && <p className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </section>
    </main>
  );
}
