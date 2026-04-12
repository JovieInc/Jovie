/** Time remaining until a target date */
export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  total: number;
}

/** Calculate time remaining until target date */
export function getTimeLeft(
  targetDate: Date,
  now: Date = new Date()
): TimeLeft {
  const total = targetDate.getTime() - now.getTime();

  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, total: 0 };
  }

  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, total };
}
