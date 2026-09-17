import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { OnboardingScreen } from './screens/Onboarding';
import { PlanScreen } from './screens/Plan';
import { SearchScreen } from './screens/SearchScreen';
import { ProgramScreen } from './screens/Program';
import { CompareScreen } from './screens/Compare';
import { PlanBScreen } from './screens/PlanB';
import { AdminScreen } from './screens/Admin';
import { DesignScreen } from './screens/Design';
import { Start } from './screens/Start';

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Start />} />
          <Route path="/onboarding/:step" element={<OnboardingScreen />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/program/:id" element={<ProgramScreen />} />
          <Route path="/compare" element={<CompareScreen />} />
          <Route path="/plan-b" element={<PlanBScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
          {import.meta.env.DEV ? <Route path="/design" element={<DesignScreen />} /> : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
