import type { ExamSubject, InterestId, RegionMode, UserProfile } from './types';
import { EXAM_SUBJECTS, INTEREST_IDS } from './types';

/**
 * Профиль для ссылки «Поделиться планом»: base64url от компактного JSON.
 * Персональных данных в нём нет — только баллы, интересы и регионы.
 */
interface SharePayload {
  v: 1;
  s: Partial<Record<ExamSubject, number>>;
  e: 0 | 1;
  b: number;
  a: string[];
  i: InterestId[];
  m: RegionMode;
  h: string | null;
  r: string[];
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(json, 'utf8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function encodeProfile(user: UserProfile): string {
  const payload: SharePayload = {
    v: 1,
    s: user.scores,
    e: user.scoresAreExpected ? 1 : 0,
    b: user.achievementsBonus,
    a: user.achievements,
    i: user.interests,
    m: user.regionMode,
    h: user.homeRegion,
    r: user.regions,
  };
  return toBase64Url(JSON.stringify(payload));
}

function isSubject(value: string): value is ExamSubject {
  return (EXAM_SUBJECTS as readonly string[]).includes(value);
}

function isInterest(value: string): value is InterestId {
  return (INTEREST_IDS as readonly string[]).includes(value);
}

/** Разбор ссылки. Любая порча данных даёт null, а не исключение. */
export function decodeProfile(encoded: string): UserProfile | null {
  try {
    const raw: unknown = JSON.parse(fromBase64Url(encoded));
    if (typeof raw !== 'object' || raw === null) return null;
    const p = raw as Partial<SharePayload>;
    if (p.v !== 1) return null;

    const scores: Partial<Record<ExamSubject, number>> = {};
    for (const [key, value] of Object.entries(p.s ?? {})) {
      if (isSubject(key) && typeof value === 'number' && value >= 0 && value <= 100) {
        scores[key] = Math.round(value);
      }
    }

    const mode: RegionMode =
      p.m === 'home' || p.m === 'several' || p.m === 'any' ? p.m : 'any';

    return {
      scores,
      scoresAreExpected: p.e === 1,
      achievementsBonus: typeof p.b === 'number' ? Math.min(Math.max(p.b, 0), 10) : 0,
      achievements: Array.isArray(p.a) ? p.a.filter((x): x is string => typeof x === 'string') : [],
      interests: Array.isArray(p.i) ? p.i.filter((x) => typeof x === 'string' && isInterest(x)) : [],
      regionMode: mode,
      homeRegion: typeof p.h === 'string' ? p.h : null,
      regions: Array.isArray(p.r) ? p.r.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}
