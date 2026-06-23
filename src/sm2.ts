/** SuperMemo-2 间隔重复算法（标准版）。
 * quality 0..5：回忆/解题质量。<3 视为没掌握，重新学。 */
export interface Sched {
  ef: number; // easiness factor
  reps: number; // 连续答对次数
  interval: number; // 当前间隔天数
}

export function sm2(prev: Sched, quality: number): Sched & { dueInDays: number } {
  let { ef, reps, interval } = prev;

  if (quality < 3) {
    reps = 0;
    interval = 1; // 没掌握，明天重练
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ef);
    reps += 1;
  }

  // EF 更新，下限 1.3
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  return { ef, reps, interval, dueInDays: interval };
}

export const FRESH: Sched = { ef: 2.5, reps: 0, interval: 0 };

/** interval 达到 21 天视为已掌握 */
export const MASTERED_INTERVAL = 21;
