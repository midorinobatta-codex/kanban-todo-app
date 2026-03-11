'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { KanbanBoard } from '@/components/kanban-board';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseClient();

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/login');
    }
  }, [loading, router, session]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await getSupabaseClient().auth.signOut();
    setLoggingOut(false);
    router.replace('/login');
  };

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-500">
        認証状態を確認しています...
      </main>
    );
  }

  return (
    <KanbanBoard
      userId={session.user.id}
      userEmail={session.user.email ?? null}
      onLogout={handleLogout}
      loggingOut={loggingOut}
    />
  );
}
