import { redirect } from 'next/navigation';

// Old matches page is replaced by the main page + /matches/[matchId].
export default function MatchesPage() {
  redirect('/');
}
