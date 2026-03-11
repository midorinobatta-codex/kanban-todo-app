'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { KanbanBoard } from '@/components/kanban-board';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await getSupabaseClient().auth.getSession();

      if (!mounted) return;

      if (!data.session) {
        router.replace('/login');
        return;
      }

      setCheckingSession(false);
    };

    void checkSession();

    const {
      data: { subscription }
    } = getSupabaseClient().auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!session) {
        router.replace('/login');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checkingSession) {
    return <p className="p-6 text-sm text-slate-500">認証状態を確認中...</p>;
  }

  return <KanbanBoard />;
}
