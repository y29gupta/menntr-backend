export function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export const IST_OFFSET_MINUTES = 330; // +05:30

export function getISTDateBoundary(daysAgo = 0) {
  const now = new Date();

  // convert to IST
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);

  // start of IST day
  istNow.setHours(0, 0, 0, 0);
  istNow.setDate(istNow.getDate() - daysAgo);

  // convert back to UTC
  return new Date(istNow.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}
