import { portalAssetUrl } from '../lib/portalAssetUrl';
import { LoadErrorBoundary } from './ui/LoadErrorBoundary';
import { useLiveData, LIVE_DATA } from '../shared/realtime/useLiveData';
import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { Settings, Shield, Globe, Calendar, Server, ChevronDown, ChevronLeft, Plus, Trash2, X, RefreshCw, Mail, Image, Palette, Monitor, Menu } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invalidateAuthenticatedRTCConfigCache } from '../lib/authenticatedRtcConfig';
import { logAudit } from '../lib/audit';
import toast from 'react-hot-toast';
const OnlineUsersPanel = lazy(() => import('./PortalConfig/OnlineUsersPanel').then(m => ({ default: m.OnlineUsersPanel })));
const UserManagementPanel = lazy(() => import('./UserManagementPanel').then(m => ({ default: m.UserManagementPanel })));
const UserGroupsPanel = lazy(() => import('./UserGroupsPanel').then(m => ({ default: m.UserGroupsPanel })));
const GroupEventsPanel = lazy(() => import('./UserGroupsPanel').then(m => ({ default: m.GroupEventsPanel })));
const NotificationsConfigPanel = lazy(() => import('./NotificationsConfigPanel').then(m => ({ default: m.NotificationsConfigPanel })));
const SmsConfigPanel = lazy(() => import('./SmsConfigPanel').then(m => ({ default: m.SmsConfigPanel })));
const CalendarOccasionsPanel = lazy(() => import('./CalendarOccasionsPanel').then(m => ({ default: m.CalendarOccasionsPanel })));
const OrgStructurePage = lazy(() => import('./OrgStructurePage').then(m => ({ default: m.OrgStructurePage })));
const SparkConfigPanel = lazy(() => import('./SparkConfigPanel').then(m => ({ default: m.SparkConfigPanel })));
const SocialNotificationsPanel = lazy(() => import('./SocialNotificationsPanel').then(m => ({ default: m.SocialNotificationsPanel })));
const DailyReportConfigPanel = lazy(() => import('./DailyReportConfigPanel').then(m => ({ default: m.DailyReportConfigPanel })));
const SystemMonitoringPage = lazy(() => import('./SystemMonitoringPage').then(m => ({ default: m.SystemMonitoringPage })));
const MinutesConfigPanel = lazy(() => import('./Minutes/MinutesConfigPanel').then(m => ({ default: m.MinutesConfigPanel })));
const BackupPanel = lazy(() => import('./BackupPanel').then(m => ({ default: m.BackupPanel })));
const SecuritySettingsConsole = lazy(() => import('../features/security-settings').then(m => ({ default: m.SecuritySettingsConsole })));
const PhoneAuthCard = lazy(() => import('./PortalConfig/PhoneAuthCard').then(m => ({ default: m.PhoneAuthCard })));
const IdentityRepairCard = lazy(() => import('./PortalConfig/IdentityRepairCard').then(m => ({ default: m.IdentityRepairCard })));

import { NAV_ITEMS, VISIBLE_SECURITY_CONFIG_KEYS } from './PortalConfig/constants';
import { ConfigField } from './PortalConfig/ConfigField';
import { SectionCard } from './PortalConfig/SectionCard';
import type { ConfigEntry, Props } from './PortalConfig/types';
import { usePermissions } from '../context/PermissionsContext';
import { canAccessConfigSection, getFirstVisibleConfigSection, getVisibleConfigNavigationItems } from '../features/permissions';

export function PortalConfigPage({ currentUserId }: Props) {
  useLiveData([...LIVE_DATA.config, ...LIVE_DATA.people], async () => { if (!uploadingKey) await loadConfigs(); });
  const { isAdmin, userPermissions } = usePermissions();
  const [activeSection, setActiveSection] = useState('general');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const visibleNavItems = getVisibleConfigNavigationItems(NAV_ITEMS, isAdmin, userPermissions);
  const firstVisibleSection = getFirstVisibleConfigSection(visibleNavItems);
  const canAccessActiveSection = canAccessConfigSection(activeSection, isAdmin, userPermissions);

  useEffect(() => {
    if (!canAccessActiveSection && firstVisibleSection) setActiveSection(firstVisibleSection);
  }, [activeSection, canAccessActiveSection, firstVisibleSection]);

  // Load configs
  const loadConfigs = useCallback(async () => {
    // Security configuration contains internal runtime flags and secret material.
    // Never fetch the whole security section into the browser; only request the
    // explicitly allow-listed operational controls used by this page.
    const securityKeys = Array.from(VISIBLE_SECURITY_CONFIG_KEYS);
    const [nonSecurityResult, securityResult] = await Promise.all([
      supabase
        .from('system_config')
        .select('*')
        .neq('section', 'security')
        .order('section')
        .order('key'),
      supabase
        .from('system_config')
        .select('*')
        .eq('section', 'security')
        .in('key', securityKeys)
        .order('key'),
    ]);

    if (nonSecurityResult.error || securityResult.error) {
      console.error('[PortalConfig] failed to load configuration', nonSecurityResult.error || securityResult.error);
      return;
    }

    const rows = [
      ...(nonSecurityResult.data ?? []),
      ...(securityResult.data ?? []),
    ] as ConfigEntry[];
    rows.sort((a, b) => a.section.localeCompare(b.section) || a.key.localeCompare(b.key));
    setConfigs(rows);
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const saveConfig = async (id: string, value: string) => {
    const cfg = configs.find(c => c.id === id);
    const { error } = await supabase.from('system_config').update({ value, updated_by: currentUserId, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('خطا در ذخیره تنظیمات'); return; }
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, value } : c));
    if (cfg?.section === 'video_conference') invalidateAuthenticatedRTCConfigCache();
    toast.success('ذخیره شد');
    logAudit({ module: 'system_config', action: 'config_updated', entity_name: cfg ? `${cfg.section}.${cfg.key}` : id, details: `مقدار جدید: ${value}`, severity: 'info' });
  };

  const cfgs = (section: string) => configs.filter(c => c.section === section);

  // Upload an image to portal-assets bucket and save the public URL to system_config
  const uploadAsset = async (configKey: string, file: File) => {
    const ext = file.name.split('.').pop();
    const path = `${configKey}-${Date.now()}.${ext}`;
    setUploadingKey(configKey);
    try {
      const { error: uploadError } = await supabase.storage.from('portal-assets').upload(path, file, { upsert: true });
      if (uploadError) { toast.error('خطا در آپلود فایل'); return; }
      const { data: urlData } = supabase.storage.from('portal-assets').getPublicUrl(path);
      const publicUrl = new URL(urlData.publicUrl).pathname;
      // Find config entry by key and save
      const entry = configs.find(c => c.section === 'appearance' && c.key === configKey);
      if (entry) { await saveConfig(entry.id, publicUrl); }
      else {
        // upsert
        await supabase.from('system_config').upsert({ section: 'appearance', key: configKey, value: publicUrl, value_type: 'string', label: configKey }, { onConflict: 'section,key' });
        await loadConfigs();
      }
      toast.success('آپلود شد');
    } finally { setUploadingKey(null); }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const isOpen = prev.has(key);
      return isOpen ? new Set<string>() : new Set<string>([key]);
    });
  };

  // ── Render content ──────────────────────────────────────────────────────────
  const renderContent = () => {
    if (!canAccessActiveSection) {
      return <div className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">برای این بخش مجوز دسترسی ندارید.</div>;
    }
    switch (activeSection) {
      // ── General ──────────────────────────────────────────────────────────
      case 'general':
        return (
          <div className="space-y-5">
            <SectionCard title="تنظیمات کلی سامانه" icon={Settings} color="blue">
              {cfgs('general').map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
            </SectionCard>
          </div>
        );

      // ── UI Settings ───────────────────────────────────────────────────────
      case 'ui_settings':
        return (
          <div className="space-y-5">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                  <Menu className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-800 dark:text-white">تنظیمات محیطی رابط کاربری</h3>
              </div>
              <div className="p-5 space-y-4">
                {(() => {
                  const entry = cfgs('ui').find(c => c.key === 'sidebar_default_collapsed');
                  const isCollapsed = !entry || entry.value === 'true' || entry.value === null;
                  return (
                    <div className="flex items-start justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">منوی کناری به صورت پیش‌فرض بسته باشد</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {isCollapsed
                            ? 'در ورود اولیه، منوی کناری به صورت آیکن‌تنها نمایش داده می‌شود'
                            : 'در ورود اولیه، منوی کناری کامل (با نام‌ها) نمایش داده می‌شود'}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          const newVal = isCollapsed ? 'false' : 'true';
                          if (entry) {
                            await saveConfig(entry.id, newVal);
                          } else {
                            await supabase.from('system_config').upsert({ section: 'ui', key: 'sidebar_default_collapsed', value: newVal, value_type: 'boolean', label: 'منوی کناری به صورت پیش‌فرض بسته باشد' }, { onConflict: 'section,key' });
                            await loadConfigs();
                          }
                        }}
                        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${isCollapsed ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isCollapsed ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );

      // ── Appearance ───────────────────────────────────────────────────────
      case 'appearance':
        return (
          <div className="space-y-5">
            <SectionCard title="ظاهر و برندینگ" icon={Palette} color="teal">
              {cfgs('appearance').map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
            </SectionCard>

            {/* Splash screen toggle */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <h4 className="font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-teal-500" />انیمیشن ورود (Splash Screen)
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">نمایش موشن‌گرافی لوگو هنگام بارگذاری اولیه سامانه</p>
              {(() => {
                const entry = cfgs('appearance').find(c => c.key === 'splash_enabled');
                const isEnabled = !entry || entry.value === 'true' || entry.value === null;
                return (
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">فعال‌سازی انیمیشن ورود</span>
                    <button
                      onClick={async () => {
                        const newVal = isEnabled ? 'false' : 'true';
                        if (entry) {
                          await saveConfig(entry.id, newVal);
                        } else {
                          await supabase.from('system_config').upsert({ section: 'appearance', key: 'splash_enabled', value: newVal, value_type: 'boolean', label: 'انیمیشن ورود' }, { onConflict: 'section,key' });
                          await loadConfigs();
                        }
                      }}
                      className={`relative w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                );
              })()}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Image className="w-4 h-4 text-teal-500" />آپلود لوگو و آیکن</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { key: 'logo_url', label: 'لوگو اصلی', fmt: 'PNG, GIF, JPEG, SVG', accept: 'image/*' },
                  { key: 'favicon_url', label: 'آیکن (Favicon)', fmt: 'PNG — 32×32px', accept: 'image/png' },
                  { key: 'mobile_logo_url', label: 'لوگو موبایل', fmt: 'PNG, GIF, JPEG', accept: 'image/*' },
                  { key: 'og_image_url', label: 'تصویر معرفی', fmt: 'PNG, GIF, JPEG', accept: 'image/*' },
                ] as const).map(({ key, label, fmt, accept }) => {
                  const current = cfgs('appearance').find(c => c.key === key)?.value;
                  const isUploading = uploadingKey === key;
                  return (
                    <label key={key} className="border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-teal-400 transition-colors cursor-pointer">
                      <input name={key} type="file" accept={accept} className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(key, f); e.target.value = ''; }} />
                      <div className="w-20 h-14 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center overflow-hidden">
                        {current ? (
                          <img src={portalAssetUrl(current)} alt={label} onError={event => { if (event.currentTarget.getAttribute('src') !== '/logo-ui.webp') event.currentTarget.src = '/logo-ui.webp'; }} className="w-full h-full object-contain p-1" />
                        ) : (
                          <Image className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                      <p className="text-xs text-gray-400">انواع مجاز: {fmt}</p>
                      {isUploading ? (
                        <span className="text-xs text-teal-500 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />در حال آپلود...</span>
                      ) : (
                        <span className="text-xs text-teal-500 hover:text-teal-600 flex items-center gap-1"><Plus className="w-3 h-3" />{current ? 'تغییر فایل' : 'بارگذاری فایل'}</span>
                      )}
                      {current && !isUploading && (
                        <button type="button" onClick={async e => { e.preventDefault(); const entry = cfgs('appearance').find(c => c.key === key); if (entry) await saveConfig(entry.id, ''); }}
                          className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 className="w-3 h-3" />حذف</button>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // ── Regional ─────────────────────────────────────────────────────────
      case 'regional':
        return (
          <div className="space-y-5">
            <SectionCard title="تنظیمات منطقه‌ای" icon={Globe} color="green">
              {cfgs('regional').map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
            </SectionCard>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-green-500" />روزهای کاری</h4>
              <div className="flex flex-wrap gap-2">
                {['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'].map(day => {
                  const entry = cfgs('regional').find(c => c.key === 'work_days');
                  const active = (entry?.value || '').includes(day);
                  return (
                    <button key={day} onClick={() => {
                      if (!entry) return;
                      const days = (entry.value || '').split(',').filter(Boolean);
                      const next = active ? days.filter(d => d !== day) : [...days, day];
                      saveConfig(entry.id, next.join(','));
                    }}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${active ? 'bg-green-500 text-white border-green-500' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-green-400'}`}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'users_list':
        return <UserManagementPanel currentUserId={currentUserId} />;

      case 'users_online':
        return <OnlineUsersPanel currentUserId={currentUserId} />;

      case 'user_groups':
        return <UserGroupsPanel currentUserId={currentUserId} />;

      case 'group_events':
        return <GroupEventsPanel />;

      case 'org_structure':
        return <OrgStructurePage />;

      case 'security':
        return (
          <div className="space-y-5">
            {isAdmin ? (
              <SectionCard title="وضعیت دسترسی سامانه" icon={Shield} color="red">
                {cfgs('security').filter(c => VISIBLE_SECURITY_CONFIG_KEYS.has(c.key)).map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
              </SectionCard>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                وضعیت تعمیر و نگهداری فقط توسط مدیر سامانه قابل تغییر است. تنظیمات امنیتی تخصصی پایین‌تر همچنان بر اساس سطح دسترسی Security Admin کنترل می‌شوند.
              </div>
            )}
            <Suspense fallback={<div className="py-8 text-center text-xs text-slate-400">در حال آماده‌سازی تنظیمات امنیتی...</div>}>
              <PhoneAuthCard />
              <IdentityRepairCard />
              <SecuritySettingsConsole />
            </Suspense>
          </div>
        );

      case 'server':
        return (
          <div className="space-y-5">
            <SectionCard title="دسترسی سرور" icon={Server} color="gray">
              {cfgs('server').map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
            </SectionCard>
          </div>
        );

      case 'notifications':
        return <NotificationsConfigPanel />;

      case 'sms':
        return <SmsConfigPanel />;

      case 'social_notifications':
        return <SocialNotificationsPanel />;

      case 'email':
        return (
          <div className="space-y-5">
            <SectionCard title="تنظیمات پست الکترونیک" icon={Mail} color="blue">
              {cfgs('email').map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
            </SectionCard>
          </div>
        );

      case 'daily_report':
        return <DailyReportConfigPanel />;

      case 'video_conference':
        return <p role="status">سرویس ویدئوکنفرانس هنوز فعال نشده است.</p>;

      case 'calendar':
        return (
          <div className="space-y-5">
            <SectionCard title="تنظیمات تقویم" icon={Calendar} color="green">
              {cfgs('calendar').map(c => <ConfigField key={c.id} entry={c} onSave={saveConfig} />)}
            </SectionCard>
            <SectionCard title="مناسبت‌های تقویم" icon={Calendar} color="blue">
              <CalendarOccasionsPanel />
            </SectionCard>
          </div>
        );

      case 'monitoring':
        return <SystemMonitoringPage />;

      case 'minutes_config':
        return <MinutesConfigPanel currentUserId={currentUserId} />;

      case 'spark_config':
        return <SparkConfigPanel />;

      case 'backup':
        return (
          <div className="p-6">
            <BackupPanel />
          </div>
        );

      default:
        return <div className="text-gray-400 text-center py-20">بخش در حال توسعه است</div>;
    }
  };

  const breadcrumb = (() => {
    for (const group of visibleNavItems) {
      const sub = group.sub.find(s => s.key === activeSection);
      if (sub) return `${group.label} / ${sub.label}`;
    }
    return '';
  })();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const SidebarNav = ({ onSelect }: { onSelect?: () => void }) => (
    <nav className="flex-1 p-2 space-y-0.5">
      {visibleNavItems.map(group => {
        const Icon = group.icon;
        const isOpen = expandedGroups.has(group.key);
        return (
          <div key={group.key}>
            <button onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors uppercase tracking-wider">
              <span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />{group.label}</span>
              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>
            {isOpen && (
              <div className="mr-4 border-r border-gray-100 dark:border-gray-700 pr-2 space-y-0.5 mt-0.5">
                {group.sub.map(s => (
                  <button key={s.key} onClick={() => { setActiveSection(s.key); onSelect?.(); }}
                    className={`w-full text-right px-3 py-1.5 text-sm rounded-xl transition-colors ${activeSection === s.key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900" dir="rtl">
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-[200] lg:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute top-0 right-0 h-full w-64 bg-white dark:bg-gray-800 flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-sm">
                <Settings className="w-4 h-4 text-blue-500" /> پیکربندی
              </h2>
              <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <SidebarNav onSelect={() => setMobileSidebarOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="hidden lg:flex w-56 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-sm">
            <Settings className="w-4 h-4 text-blue-500" /> پیکربندی
          </h2>
        </div>
        <SidebarNav />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 flex-shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 min-w-0">
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span className="text-gray-400 hidden sm:inline">/</span>
              <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{breadcrumb}</span>
            </div>
          </div>
          {activeSection !== 'group_events' && <button onClick={() => { loadConfigs(); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors flex-shrink-0">
            <RefreshCw className="w-4 h-4" />
          </button>}
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <LoadErrorBoundary key={activeSection}>
            <Suspense fallback={(
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            )}>
              {renderContent()}
            </Suspense>
          </LoadErrorBoundary>
        </div>
      </div>
    </div>
  );
}
