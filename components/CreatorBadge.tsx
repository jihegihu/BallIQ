// The mark beside the creator's name. Renders nothing for anyone else, so call
// sites can drop it next to any username without a conditional.

import Icon from '@/components/Icon';
import { isCreator } from '@/lib/creator';

export default function CreatorBadge({ userId, className = '' }: { userId: string | null | undefined; className?: string }) {
  if (!isCreator(userId)) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 shrink-0 px-1.5 py-px rounded-md bg-accent/15 text-accent text-[9px] font-black uppercase tracking-wide align-middle ${className}`}
    >
      <Icon name="sparkle" size={9} />Creator
    </span>
  );
}
