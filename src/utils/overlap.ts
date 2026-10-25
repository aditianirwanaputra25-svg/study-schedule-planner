export interface ScheduleInterval {
  tanggal: string;
  waktu_mulai: string;
  waktu_selesai: string;
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export function overlaps(first: ScheduleInterval, second: ScheduleInterval): boolean {
  return (
    first.tanggal === second.tanggal &&
    normalizeTime(first.waktu_mulai) < normalizeTime(second.waktu_selesai) &&
    normalizeTime(first.waktu_selesai) > normalizeTime(second.waktu_mulai)
  );
}
