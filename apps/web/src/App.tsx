import { Suspense, lazy } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { Start } from './screens/Start';
import { Skeleton } from './ui';

/*
 * Первый экран грузится сразу, остальные — отдельными чанками.
 * Снимок данных весит больше двух мегабайт: если тянуть его в начальном
 * бандле, первый экран на телефоне откроется заметно позже.
 */
const OnboardingScreen = lazy(() =>
  import('./screens/Onboarding').then((m) => ({ default: m.OnboardingScreen })),
);
const PlanScreen = lazy(() => import('./screens/Plan').then((m) => ({ default: m.PlanScreen })));
const SearchScreen = lazy(() =>
  import('./screens/SearchScreen').then((m) => ({ default: m.SearchScreen })),
);
const ProgramScreen = lazy(() =>
  import('./screens/Program').then((m) => ({ default: m.ProgramScreen })),
);
const CompareScreen = lazy(() =>
  import('./screens/Compare').then((m) => ({ default: m.CompareScreen })),
);
const PlanBScreen = lazy(() => import('./screens/PlanB').then((m) => ({ default: m.PlanBScreen })));
const AdminScreen = lazy(() => import('./screens/Admin').then((m) => ({ default: m.AdminScreen })));
const DesignScreen = lazy(() =>
  import('./screens/Design').then((m) => ({ default: m.DesignScreen })),
);

/** Скелетон вместо пустоты, пока грузится чанк экрана. */
function ScreenFallback() {
  return (
    <div className="stack" role="status" aria-label="Загружаем экран">
      <Skeleton height={28} width="60%" />
      <Skeleton height={16} width="40%" />
      <Skeleton height={180} />
      <Skeleton height={120} />
    </div>
  );
}

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Start />} />
          <Route
            path="/*"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Routes>
                  <Route path="/onboarding/:step" element={<OnboardingScreen />} />
                  <Route path="/plan" element={<PlanScreen />} />
                  <Route path="/search" element={<SearchScreen />} />
                  <Route path="/program/:id" element={<ProgramScreen />} />
                  <Route path="/compare" element={<CompareScreen />} />
                  <Route path="/plan-b" element={<PlanBScreen />} />
                  <Route path="/admin" element={<AdminScreen />} />
                  {import.meta.env.DEV ? <Route path="/design" element={<DesignScreen />} /> : null}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}
