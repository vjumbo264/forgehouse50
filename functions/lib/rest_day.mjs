// Rest-day catch-up logic (Item i6).
// In ForgeHouse 50, Tuesdays and Fridays are rest/fasting/prayer days.
// Catch-up reading is allowed on rest days, but closes at 7pm (19:00) WAT for Bible Study.
// Cutoff time is stored in programme_config (default '19:00', timezone Africa/Lagos).

export const DEFAULT_CUTOFF_TIME = '19:00';
export const WAT_TIMEZONE = 'Africa/Lagos';

export function getWatDateAndMinutes(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;

  const weekday = partMap.weekday; // 'Tue', 'Fri', etc.
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const totalMinutes = hour * 60 + minute;
  const isoDate = `${partMap.year}-${partMap.month}-${partMap.day}`;

  const isRestDay = weekday === 'Tue' || weekday === 'Fri';

  return {
    weekday,
    isRestDay,
    hour,
    minute,
    totalMinutes,
    isoDate,
  };
}

export async function getRestDayStatus(db, nowMs = Date.now()) {
  const wat = getWatDateAndMinutes(nowMs);

  let cutoffSetting = DEFAULT_CUTOFF_TIME;
  try {
    const row = await db.prepare(
      "SELECT value FROM programme_config WHERE key = 'rest_day_catchup_cutoff_time'"
    ).first();
    if (row && row.value) cutoffSetting = String(row.value).trim();
  } catch (_) {}

  const [ch, cm] = cutoffSetting.split(':').map((v) => parseInt(v, 10) || 0);
  const cutoffTotalMinutes = ch * 60 + cm;

  if (!wat.isRestDay) {
    return {
      is_rest_day: false,
      weekday: wat.weekday,
      catchup_allowed: true,
      cutoff_time: cutoffSetting,
      timezone: WAT_TIMEZONE,
      message: null,
    };
  }

  const isBeforeCutoff = wat.totalMinutes < cutoffTotalMinutes;

  return {
    is_rest_day: true,
    weekday: wat.weekday,
    catchup_allowed: isBeforeCutoff,
    cutoff_time: cutoffSetting,
    timezone: WAT_TIMEZONE,
    message: isBeforeCutoff
      ? `Catch-up closes at ${ch > 12 ? ch - 12 : ch}${cm ? `:${cm}` : ''}pm today for Bible Study.`
      : 'Catch-up closes at 7pm today for Bible Study, continue tomorrow.',
  };
}
