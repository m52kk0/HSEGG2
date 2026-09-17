import { create } from 'zustand';
import { LIMITS, type UserProfile } from '@cursus/core';
import { makeId, readJson, removeKey, writeJson } from '@/lib/storage';
import {
  autoPlan,
  availableUniversityCount,
  initialProgramsForUniversity,
  layoutFromPlan,
  type PlanLayout,
} from '@/lib/plan';
import { track } from '@/lib/analytics';

const KEY_PROFILE = 'cursus.profile.v1';
const KEY_LAYOUT = 'cursus.layout.v1';
const KEY_COMPARE = 'cursus.compare.v1';
const KEY_SESSION = 'cursus.session.v1';

export interface StoreState {
  sessionId: string;
  profile: UserProfile | null;
  layout: PlanLayout | null;
  compare: string[];

  setProfile: (profile: UserProfile) => void;
  resetAll: () => void;

  moveProgram: (universityId: string, programId: string, direction: -1 | 1) => void;
  removeProgram: (universityId: string, programId: string) => void;
  addProgram: (universityId: string, programId: string) => void;
  addUniversity: (universityId: string) => void;
  removeUniversity: (universityId: string) => void;

  toggleCompare: (programId: string) => void;
  setCompare: (programIds: string[]) => void;
  clearCompare: () => void;
}

function loadSessionId(): string {
  const stored = readJson<string>(KEY_SESSION);
  if (typeof stored === 'string' && stored.length > 0) return stored;
  const fresh = makeId();
  writeJson(KEY_SESSION, fresh);
  return fresh;
}

export const useStore = create<StoreState>((set, get) => ({
  sessionId: loadSessionId(),
  profile: readJson<UserProfile>(KEY_PROFILE),
  layout: readJson<PlanLayout>(KEY_LAYOUT),
  compare: readJson<string[]>(KEY_COMPARE) ?? [],

  setProfile: (profile) => {
    const layout = layoutFromPlan(autoPlan(profile));
    writeJson(KEY_PROFILE, profile);
    writeJson(KEY_LAYOUT, layout);
    set({ profile, layout });
  },

  resetAll: () => {
    removeKey(KEY_PROFILE);
    removeKey(KEY_LAYOUT);
    removeKey(KEY_COMPARE);
    set({ profile: null, layout: null, compare: [] });
  },

  moveProgram: (universityId, programId, direction) => {
    const layout = get().layout;
    if (!layout) return;
    const next: PlanLayout = {
      universities: layout.universities.map((u) => {
        if (u.id !== universityId) return u;
        const ids = [...u.programIds];
        const from = ids.indexOf(programId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= ids.length) return u;
        [ids[from], ids[to]] = [ids[to]!, ids[from]!];
        return { ...u, programIds: ids };
      }),
    };
    writeJson(KEY_LAYOUT, next);
    set({ layout: next });
    track('plan_edit', { action: direction === -1 ? 'move_up' : 'move_down' });
  },

  removeProgram: (universityId, programId) => {
    const layout = get().layout;
    if (!layout) return;
    const next: PlanLayout = {
      universities: layout.universities.map((u) =>
        u.id === universityId
          ? { ...u, programIds: u.programIds.filter((id) => id !== programId) }
          : u,
      ),
    };
    writeJson(KEY_LAYOUT, next);
    set({ layout: next });
    track('plan_edit', { action: 'remove_program' });
  },

  addProgram: (universityId, programId) => {
    const { layout, profile } = get();
    if (!profile) return;

    const base: PlanLayout = layout ?? { universities: [] };
    const exists = base.universities.some((u) => u.id === universityId);

    let next: PlanLayout;
    if (exists) {
      next = {
        universities: base.universities.map((u) => {
          if (u.id !== universityId) return u;
          if (u.programIds.includes(programId)) return u;
          if (u.programIds.length >= LIMITS.maxProgramsPerUniversity) return u;
          return { ...u, programIds: [...u.programIds, programId] };
        }),
      };
    } else {
      if (base.universities.length >= LIMITS.maxUniversities) return;
      next = { universities: [...base.universities, { id: universityId, programIds: [programId] }] };
    }

    writeJson(KEY_LAYOUT, next);
    set({ layout: next });
    track('plan_edit', { action: 'add_program' });
  },

  addUniversity: (universityId) => {
    const { layout, profile } = get();
    if (!profile) return;
    const base: PlanLayout = layout ?? { universities: [] };
    if (base.universities.some((u) => u.id === universityId)) return;
    if (base.universities.length >= LIMITS.maxUniversities) return;

    const next: PlanLayout = {
      universities: [
        ...base.universities,
        { id: universityId, programIds: initialProgramsForUniversity(profile, universityId) },
      ],
    };
    writeJson(KEY_LAYOUT, next);
    set({ layout: next });
    track('plan_edit', { action: 'add_university' });
  },

  removeUniversity: (universityId) => {
    const layout = get().layout;
    if (!layout) return;
    const next: PlanLayout = {
      universities: layout.universities.filter((u) => u.id !== universityId),
    };
    writeJson(KEY_LAYOUT, next);
    set({ layout: next });
    track('plan_edit', { action: 'remove_university' });
  },

  toggleCompare: (programId) => {
    const current = get().compare;
    const next = current.includes(programId)
      ? current.filter((id) => id !== programId)
      : [...current, programId].slice(-LIMITS.maxCompare);
    writeJson(KEY_COMPARE, next);
    set({ compare: next });
  },

  setCompare: (programIds) => {
    const next = programIds.slice(0, LIMITS.maxCompare);
    writeJson(KEY_COMPARE, next);
    set({ compare: next });
  },

  clearCompare: () => {
    writeJson(KEY_COMPARE, []);
    set({ compare: [] });
  },
}));

/** Сколько вузов доступно профилю. Считается один раз на профиль. */
const availableCache = new Map<string, number>();

export function useAvailableUniversities(): number {
  const profile = useStore((s) => s.profile);
  if (!profile) return 0;
  const key = JSON.stringify([profile.scores, profile.interests, profile.regionMode, profile.homeRegion, profile.regions, profile.achievementsBonus]);
  const cached = availableCache.get(key);
  if (cached !== undefined) return cached;
  const value = availableUniversityCount(profile);
  availableCache.set(key, value);
  return value;
}
