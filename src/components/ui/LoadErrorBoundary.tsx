import { Component, type ReactNode } from 'react';

export class LoadErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section role="alert" dir="rtl" className="mx-auto my-6 max-w-lg rounded-xl border border-slate-200 bg-white p-5 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <h2 className="font-bold">بارگذاری این بخش ناموفق بود</h2>
        <p className="mt-2 text-sm">پس از بررسی اتصال، صفحه را دوباره بارگذاری کنید تا فایل‌های نسخهٔ فعلی دریافت شوند.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
          بارگذاری دوبارهٔ صفحه
        </button>
      </section>
    );
  }
}
