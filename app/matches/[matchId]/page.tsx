import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import GameBetTable from '@/components/GameBetTable';
import { rowToMatch } from '@/lib/matchRow';

export default async function GameDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (error || !data) notFound();

  return <GameBetTable match={rowToMatch(data)} />;
}
