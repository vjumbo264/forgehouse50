// Rest-day catch-up logic (Item i6).
// Tuesdays and Fridays are rest/fasting/prayer days in ForgeHouse 50.
// Outstanding catch-up reading is allowed on rest days until the admin-configurable
// cutoff time (default '19:00', Africa/Lagos = WAT, UTC+1), after which it closes for Bible Study.

export const DEFAULT_CUTOFF_TIME = '19:00';
export const WAT_TIMEZONE = 'Africa/Lagos';

export function formatCutoffDisplay(hhmm) {
  const [rawH, rawM] = String(hhmm || DEFAULT_CUTOFF_TIME).split(':').map(v => parseInt(v, 10) || 0);
  const h = ((rawH % 24) + 24) % 24;
  const m = Math.max(0, Math.min(59, rawM));
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minPart = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
  return `${hour12}${minPart}${suffix}`;
}

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
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(d);
  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;

  const weekday = partMap.weekday; // 'Tue', 'Fri', etc.
  const hour = (parseInt(partMap.hour, 10) || 0) % 24;
  const minute = parseInt(partMap.minute, 10) || 0;
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

  const [chRaw, cmRaw] = cutoffSetting.split(':').map(v => parseInt(v, 10) || 0);
  const ch = ((chRaw % 24) + 24) % 24;
  const cm = Math.max(0, Math.min(59, cmRaw));
  const cutoffTotalMinutes = ch * 60 + cm;
  const displayCutoff = formatCutoffDisplay(`${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`);

  if (!wat.isRestDay) {
    return {
      is_rest_day: false,
      weekday: wat.weekday,
      catchup_allowed: true,
      cutoff_time: cutoffSetting,
      cutoff_display: displayCutoff,
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
    cutoff_display: displayCutoff,
    timezone: WAT_TIMEZONE,
    message: isBeforeCutoff
      ? `Catch-up closes at ${displayCutoff} today for Bible Study.`
      : `Catch-up closes at ${displayCutoff} today for Bible Study, continue tomorrow.`,
  };
}
