/** Проверка демо-сценария из раздела 15 ТЗ. Запуск: pnpm tsx scripts/check-demo-scenario.ts */
import { ZONE_LABELS, buildPlan, evaluate, type UserProfile } from '@cursus/core';
import { getUniversity, programs, programsOfUniversity, universities } from '@cursus/data';
import { collectCandidates } from '@cursus/core';

const user: UserProfile = {
  scores: { russian: 78, math: 76, physics: 70, informatics: 72 },
  scoresAreExpected: false,
  achievementsBonus: 2,
  achievements: ['Знак ГТО'],
  interests: ['engineering', 'it', 'energy'],
  regionMode: 'home',
  homeRegion: 'Нижегородская область',
  regions: [],
};

const NGTU = 'Q4318652';
const NNGU = 'Q492766';

console.info('=== Закреплённые программы НГТУ ===');
for (const code of ['15.03.04', '13.03.02', '27.03.04', '09.03.01', '09.03.04', '13.03.01']) {
  const p = programsOfUniversity(NGTU).find((x) => x.code === code);
  if (!p) {
    console.info(`${code}: НЕТ ПРОГРАММЫ`);
    continue;
  }
  const e = evaluate(p, user);
  console.info(
    `${code}: балл ${e.score.total}, прогноз ${e.forecast.predictedCutoff}, запас ${e.margin}, зона ${e.zone ? ZONE_LABELS[e.zone] : '—'}`,
  );
}

console.info('\n=== Закреплённые программы ННГУ ===');
for (const code of ['09.03.01', '09.03.04', '02.03.01', '01.03.02']) {
  const p = programsOfUniversity(NNGU).find((x) => x.code === code);
  console.info(`${code}: ${p ? 'есть' : 'НЕТ'}`);
}

const candidates = collectCandidates({ user, programs, universities });
console.info(`\n=== Кандидатов-вузов: ${candidates.length} ===`);
candidates.slice(0, 10).forEach((c, i) => {
  console.info(
    `${i + 1}. ${c.university.name} · рейтинг ${c.rating.toFixed(1)} · программ ${c.programs.length} · safe:${c.hasSafe} target:${c.hasTarget} reach:${c.hasReach}`,
  );
});
const ngtuIndex = candidates.findIndex((c) => c.university.wikidata === NGTU);
console.info(`НГТУ в рейтинге: место ${ngtuIndex + 1}`);

const plan = buildPlan(user, programs, universities);
console.info(`\n=== Вердикт: ${plan.verdict.title} — ${plan.verdict.detail} ===`);
for (const u of plan.universities) {
  console.info(`\n${u.university.name} (${u.university.city})`);
  for (const p of u.programs) {
    console.info(
      `  ${p.priority}. ${p.program.code} ${p.program.name} — ${ZONE_LABELS[p.zone]} ${p.margin > 0 ? '+' : ''}${p.margin}`,
    );
  }
  console.info(`  => ${u.likelyAdmission ?? 'нет запасного'}`);
}
console.info('\nПредупреждения:');
for (const w of plan.warnings) console.info(` - [${w.id}] ${w.text}`);

// Распределение зон по всему снимку — калибровка демо-данных.
let safe = 0;
let target = 0;
let reach = 0;
for (const p of programs) {
  const e = evaluate(p, user);
  if (e.zone === 'safe') safe += 1;
  else if (e.zone === 'target') target += 1;
  else if (e.zone === 'reach') reach += 1;
}
const total = safe + target + reach;
console.info(
  `\nЗоны по всем подходящим программам РФ: Запасной ${safe} (${Math.round((safe / total) * 100)}%), Цель ${target} (${Math.round((target / total) * 100)}%), Мечта ${reach} (${Math.round((reach / total) * 100)}%)`,
);
console.info(`Вузов НН в снимке: ${universities.filter((u) => u.region === 'Нижегородская область').length}`);
console.info(`НГТУ найден: ${getUniversity(NGTU)?.name ?? 'НЕТ'}`);
