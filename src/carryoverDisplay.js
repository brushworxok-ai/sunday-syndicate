// Presentation only: this historical promotion was retired by the league owner.
export function isRetiredCarryoverPromotion(season, rollover) {
  const weeks = rollover?.sourceWeeks?.length ? rollover.sourceWeeks : [rollover?.sourceWeek];
  return Number(season) === 2026 && Number(rollover?.amount) === 220
    && weeks.every((week) => Number(week) === 2);
}
