import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  if (!ids.length) return NextResponse.json({ matches: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('matches')
    .select('id, status, home_score, away_score, home_team, away_team, commence_time')
    .in('id', ids);

  if (error) return NextResponse.json({ matches: [] });

  return NextResponse.json({ matches: data ?? [] });
}
