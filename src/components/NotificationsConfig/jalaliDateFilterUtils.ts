import moment from 'moment-jalaali';

/**
 * Converts a Jalali date string (e.g. "1405/05/10") to a UTC date range
 * covering the full Tehran day (00:00–23:59:59.999 Asia/Tehran).
 * Returns null if the input is empty or invalid.
 */
export function jalaliToUtcRange(
  jalaliDate: string,
): { start: string; end: string } | null {
  if (!jalaliDate.trim()) return null;

  const m = moment(jalaliDate, 'jYYYY/jMM/jDD');
  if (!m.isValid()) return null;

  const g = m.toDate();
  const start = new Date(
    g.getFullYear(),
    g.getMonth(),
    g.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    g.getFullYear(),
    g.getMonth(),
    g.getDate(),
    23,
    59,
    59,
    999,
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Formats a Jalali date string for display as "YYYY/MM/DD شمسی".
 */
export function formatJalaliDateInput(jalaliDate: string): string {
  return jalaliDate;
}
