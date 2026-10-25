export function getWeekRangeWib(now: Date): { from: string; through: string } {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dayOfWeek = wib.getUTCDay();
  wib.setUTCDate(wib.getUTCDate() - ((dayOfWeek + 6) % 7));
  const from = wib.toISOString().slice(0, 10);
  wib.setUTCDate(wib.getUTCDate() + 6);
  return { from, through: wib.toISOString().slice(0, 10) };
}

export function classifyDeadline(
  deadline: string,
  status: string,
  nowWib: string,
  days: number,
): "terlambat" | "mendekati" | null {
  if (status !== "belum selesai") return null;
  if (deadline < nowWib) return "terlambat";

  const end = new Date(`${nowWib}Z`);
  end.setUTCDate(end.getUTCDate() + days);
  const endWib = end.toISOString().slice(0, 19);
  return deadline <= endWib ? "mendekati" : null;
}
