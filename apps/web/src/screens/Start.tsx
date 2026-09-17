import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { decodeProfile } from '@cursus/core';
import { snapshotStats } from '@cursus/data';
import { Button, Card } from '@/ui';
import { useStore } from '@/store/useStore';
import { track } from '@/lib/analytics';

/**
 * Вход. Если профиль уже есть — сразу план. Если в ссылке есть профиль
 * («Поделиться планом») — принимаем его и строим план по нему.
 */
export function Start() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const shared = params.get('p');

  useEffect(() => {
    if (!shared) return;
    const decoded = decodeProfile(shared);
    if (decoded) {
      setProfile(decoded);
      navigate('/plan', { replace: true });
    }
  }, [shared, setProfile, navigate]);

  if (profile && !shared) return <Navigate to="/plan" replace />;

  return (
    <div className="stack-l" style={{ paddingTop: 'calc(var(--space) * 4)' }}>
      <div className="stack">
        <p className="text-secondary">Навигатор поступления на бюджет</p>
        <h1>Не гадай — проложи курс</h1>
        <p className="text-secondary" style={{ maxWidth: '52ch' }}>
          Справочники показывают, какие дороги существуют. Cursus строит маршрут: до 5 вузов
          и до 5 направлений в каждом, в правильном порядке — по правилам приёма 2026 года.
        </p>
      </div>

      <Button
        onClick={() => {
          track('onboarding_start');
          navigate('/onboarding/1');
        }}
      >
        Построить план
      </Button>

      <div className="stack">
        <Card variant="flat">
          <div className="stack-s">
            <h3>Что получишь за 4 вопроса</h3>
            <ul className="stack-s text-secondary small">
              <li>— Ответ, хватает ли баллов на бюджет, одной фразой.</li>
              <li>— Порядок направлений: что ставить первым приоритетом и почему.</li>
              <li>— Запас баллов к прогнозу проходного: «+12» или «−8», без процентов-гаданий.</li>
              <li>— Зарплаты выпускников и живые вакансии по направлению.</li>
              <li>— План Б, если не пройдёшь никуда.</li>
            </ul>
          </div>
        </Card>

        <p className="small text-secondary">
          В прототипе {snapshotStats.universities} вузов и {snapshotStats.directions} направлений.
          Проходные баллы — тестовые, они помечены «Демо». Регистрации и личных данных нет.
        </p>
      </div>
    </div>
  );
}
