import { portalAssetUrl } from '../../lib/portalAssetUrl';
import { supabase } from '../../lib/supabase';
import type { MinutesLayoutConfig } from './MinutesDocumentData';
import { FALLBACK_LOGO } from './MinutesDocumentData';

const VALID_FONT_SIZES = new Set(['small', 'medium', 'large']);
const VALID_CONFIDENTIALITY = new Set(['public', 'organizational', 'restricted', 'confidential']);
const VALID_APPROVAL_MODES = new Set(['system', 'in_person']);

const DEFAULT_CONFIG: MinutesLayoutConfig = {
  headerTitle: 'صورت‌جلسه',
  orgName: '',
  subtitle: '',
  footerText: 'پایان صورت‌جلسه',
  showLogo: true,
  showParticipants: true,
  showApprovers: true,
  showConfidentiality: true,
  showDecisions: true,
  showNotes: true,
  showAbsentees: true,
  showAgenda: true,
  fontSize: 'medium',
};

function trimMax(v: string | null | undefined, max: number): string {
  if (!v) return '';
  return v.trim().slice(0, max);
}

function parseBool(v: string | null | undefined, fallback: boolean): boolean {
  if (v === null || v === undefined) return fallback;
  return v === 'true';
}

export function normalizeMinutesLayoutConfig(map: Map<string, string>): MinutesLayoutConfig {
  const fontSize = map.get('minutes.minutes_font_size') || 'medium';
  return {
    headerTitle: trimMax(map.get('minutes.minutes_header_title'), 100) || DEFAULT_CONFIG.headerTitle,
    orgName: trimMax(map.get('minutes.minutes_org_name'), 200),
    subtitle: trimMax(map.get('minutes.minutes_subtitle'), 200),
    footerText: trimMax(map.get('minutes.minutes_footer_text'), 200) || DEFAULT_CONFIG.footerText,
    showLogo: parseBool(map.get('minutes.minutes_show_logo'), true),
    showParticipants: parseBool(map.get('minutes.minutes_show_participants'), true),
    showApprovers: parseBool(map.get('minutes.minutes_show_approvers'), true),
    showConfidentiality: parseBool(map.get('minutes.minutes_show_confidentiality'), true),
    showDecisions: parseBool(map.get('minutes.minutes_show_decisions'), true),
    showNotes: parseBool(map.get('minutes.minutes_show_notes'), true),
    showAbsentees: parseBool(map.get('minutes.minutes_show_absentees'), true),
    showAgenda: parseBool(map.get('minutes.minutes_show_agenda'), true),
    fontSize: VALID_FONT_SIZES.has(fontSize) ? fontSize : 'medium',
  };
}

export function resolveMinutesLogoUrl(map: Map<string, string>): string {
  const minutesLogo = trimMax(map.get('minutes.minutes_logo_url'), 500);
  if (minutesLogo) return portalAssetUrl(minutesLogo);
  const portalLogo = trimMax(map.get('appearance.logo_url'), 500);
  if (portalLogo) return portalAssetUrl(portalLogo);
  return FALLBACK_LOGO;
}

export function validateMinutesConfigValue(key: string, value: string): boolean {
  switch (key) {
    case 'minutes_default_confidentiality':
      return VALID_CONFIDENTIALITY.has(value);
    case 'minutes_default_approval_mode':
      return VALID_APPROVAL_MODES.has(value);
    case 'minutes_font_size':
      return VALID_FONT_SIZES.has(value);
    case 'minutes_show_logo':
    case 'minutes_show_participants':
    case 'minutes_show_approvers':
    case 'minutes_show_confidentiality':
    case 'minutes_show_decisions':
    case 'minutes_show_notes':
    case 'minutes_show_absentees':
    case 'minutes_show_agenda':
      return value === 'true' || value === 'false';
    default:
      return true;
  }
}

export async function fetchMinutesConfig(): Promise<{ logoUrl: string; config: MinutesLayoutConfig; rawMap: Map<string, string> }> {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('section, key, value')
      .or('section.eq.minutes,section.eq.appearance.and.key.eq.logo_url');
    if (error) throw error;

    const rows = (data || []) as Array<{ section: string; key: string; value: string | null }>;
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(`${r.section}.${r.key}`, r.value ?? '');
    }

    return {
      logoUrl: resolveMinutesLogoUrl(map),
      config: normalizeMinutesLayoutConfig(map),
      rawMap: map,
    };
  } catch {
    return {
      logoUrl: FALLBACK_LOGO,
      config: DEFAULT_CONFIG,
      rawMap: new Map(),
    };
  }
}

export function getDefaultConfidentiality(map: Map<string, string>): string {
  const v = map.get('minutes.minutes_default_confidentiality') || 'organizational';
  return VALID_CONFIDENTIALITY.has(v) ? v : 'organizational';
}

export function getDefaultApprovalMode(map: Map<string, string>): string {
  const v = map.get('minutes.minutes_default_approval_mode') || 'system';
  return VALID_APPROVAL_MODES.has(v) ? v : 'system';
}
