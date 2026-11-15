// Who gets the Creator badge.
//
// Keyed on the account's internal id, not on a name. Usernames re-sync from
// Clerk on every load and anyone can call themselves "Josh (Creator)", so a
// name-based mark would be both unstable and forgeable. The id is neither: it
// never changes and nobody else can have it.
//
// A constant rather than a database column on purpose. A column would need a
// migration, and every query selecting it would fail until that migration had
// been run — taking the leaderboard down for the sake of a badge.
export const CREATOR_USER_ID = '9713216b-d876-4d49-9714-b542d3397b18';

export function isCreator(userId: string | null | undefined): boolean {
  return userId === CREATOR_USER_ID;
}
