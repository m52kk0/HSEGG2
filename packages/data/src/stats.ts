/**
 * Маленький файл статистики снимка — отдельно от самого снимка.
 * Первому экрану нужны только числа; если брать их из index.ts, браузер
 * подтянет все 2,6 МБ данных ещё до того, как человек нажал «Построить план».
 *
 * Файл пересобирается вместе с демо-программами (pnpm gen:programs),
 * а тест сверяет его с фактическим содержимым снимка.
 */
import stats from '../../../data/snapshot/stats.json';

export interface SnapshotStats {
  date: string;
  directions: number;
  universities: number;
  regions: number;
  programs: number;
}

export const SNAPSHOT_STATS: SnapshotStats = stats;
