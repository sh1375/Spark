# Spark Server Manager

Spark Server Manager ابزار مدیریت Production سامانه Spark روی Ubuntu 24.04 است.
نسخه فعلی Manager: `3.0.0`.
نسخه `3.x` رابط قدیمی مبتنی بر `terminal-menus.sh` را به طور کامل کنار گذاشته و
از یک **single-screen curses dashboard** استفاده می‌کند؛ منو، وضعیت سرور، جزئیات
Action و خروجی/Prompt عملیات همگی در همان صفحه باقی می‌مانند.

## نصب

```bash
curl -fsSL https://raw.githubusercontent.com/sh1375/Spark/main/deploy/spark-cli/bootstrap.sh | sudo bash
```

سپس:

```bash
spark
```

برای دیدن وضعیت واقعی تمام ۲۱ مرحله نصب بدون اجرای مجدد نصب:

```bash
spark --steps
```

این گزارش برای هر شماره دو ستون جدا دارد: `Actual` با تست واقعی همان بخش روی سرور،
و `History` که فقط نشان می‌دهد آن مرحله قبلاً توسط Spark Manager با موفقیت ثبت شده است.
بنابراین Down شدن سرویس، حذف شدن فایل/تنظیم، عقب‌ماندن migration یا غیرفعال شدن UFW
با تیک قدیمی اشتباه گرفته نمی‌شود.

## معماری رابط v3

- `deploy/spark-cli/spark` — Bash backend/launcher و نقطه اتصال به moduleهای عملیاتی موجود.
- `deploy/spark-cli/spark-ui.py` — رابط Python stdlib `curses`.
- `deploy/spark-cli/lib/*.sh` — منطق عملیاتی نصب، Update، Backup، تست، Security، Cleanup و Serviceها.

UI یک renderer پایدار و تمام‌صفحه دارد و با `noutrefresh()` / `doupdate()` فقط
تغییرات لازم را به ترمینال می‌فرستد. بنابراین دیگر چرخه‌ی clear/rebuild مربوط به
TUI قبلی وجود ندارد.

هنگام اجرای Action، backend داخل یک PTY فرزند اجرا می‌شود. خروجی در پنل پایین
نمایش داده می‌شود و ورودی صفحه‌کلید به همان PTY ارسال می‌شود؛ در نتیجه promptهای
موجود مثل `MIGRATE`، `OPEN`، `RESTART` و ورودی‌های مراحل نصب بدون خروج از داشبورد
کار می‌کنند.

`terminal-menus.sh` و wrapper قدیمی `spark-tui.sh` دیگر runtime dependency نیستند.

## چیدمان

صفحه اصلی همزمان شامل این بخش‌ها است:

- Header: نسخه/Build Manager، host، commit فعال، History مراحل نصب، وضعیت Database `5432` و Studio `8443`.
- Sections: دسته‌بندی عملیات.
- Actions: Actionهای دسته انتخاب‌شده.
- Details / Live Status: شرح Action و وضعیت Nginx/Coturn/Docker/DB/Studio/History/Backup.
- Output: خروجی و prompt زنده Task یا محتوای log انتخاب‌شده.
- Footer: کلیدهای navigation و کنترل Task.

## کنترل‌ها

در حالت عادی:

- `Tab` یا `Left/Right`: تغییر پنل فعال.
- `Up/Down` یا `j/k`: حرکت در لیست.
- `Enter`: اجرای Action انتخاب‌شده.
- `/`: فیلتر fuzzy روی Actionهای دسته جاری.
- `L`: مرور logهای Spark Manager داخل همان صفحه.
- `R`: refresh فوری وضعیت.
- `PgUp/PgDn`: scroll پنل Output.
- `?`: Help.
- `Q`: خروج.

هنگام اجرای Task:

- متن تایپ‌شده و `Enter` مستقیماً به PTY Task ارسال می‌شود.
- `PgUp/PgDn`: scroll خروجی.
- `Ctrl-C`: ارسال SIGINT به Task در حال اجرا.

## عملیات موجود

Dashboard همه قابلیت‌های Manager قبلی را بدون منوهای nested در دسترس قرار می‌دهد:

- ۲۱ مرحله نصب فعال (شماره‌های پیوسته 01–21؛ مراحل 19–21 مخصوص LiveKit) و Run All؛ migration دیتابیس از Installer حذف شده و ابزار مستقل `spark-migrate` مسیر آن است.
- گزارش `Installation status` با Actual Probe برای دیدن شماره‌های Installed / Not Installed و History جداگانه.
- Full validation و تست‌های Frontend/API/Docker/Nginx/Scheduler/TURN/Exposure/DNS/SSL.
- Docker service log selector.
- Update کنترل‌شده Spark.
- Linux package update.
- Resource monitor.
- Node/npm maintenance و audit بدون lint.
- Access & Credentials: نمایش Credentialهای انسانی و باز/بستن Database روی `5432` و Supabase Studio روی `8443`.
- Service management.
- Backup management.
- Certificate management.
- Cleanup / Remove برای حذف جزءبه‌جزء یا حذف کامل پروژه.
- Version/Security information.
- Self-update Manager.

## Cleanup / Remove

تمام عملیات حذف destructive هستند و قبل از اجرا عبارت تأیید دقیق خودشان را می‌خواهند.
Actionهای اصلی:

- `Delete Database data` — Supabase را متوقف می‌کند، mount واقعی PostgreSQL را از Compose تشخیص می‌دهد و فقط همان data path را حذف می‌کند. اگر مسیر با اطمینان قابل تشخیص نباشد، حذف متوقف می‌شود و حدس زده نمی‌شود.
- `Delete Supabase runtime` — کل `/opt/spark-supabase` شامل runtime data/volumes/config/secrets را حذف می‌کند؛ Supabase source pin باقی می‌ماند.
- `Delete deployed Frontend` — فقط `/var/www/spark` را حذف می‌کند.
- `Delete Spark source` — فقط repository محلی `/opt/spark` را حذف می‌کند؛ GitHub و Manager باقی می‌مانند.
- `Delete Manager logs` — فقط `/var/log/spark-manager` را پاک می‌کند؛ Journal سیستم و Docker logs حذف نمی‌شوند.
- `Delete all Backups` — تمام Backupهای `/var/backups/spark` را حذف می‌کند.
- `Reset install History` — فقط markerهای DONE مراحل نصب را پاک می‌کند و به Runtime/Data دست نمی‌زند.
- `Delete complete Spark project` — Source، Supabase Runtime/Data، Frontend، Spark config/secrets، Nginx config، Schedulerها، TURN config، Certificateهای دامنه‌های Spark، Backupها و Logها را حذف می‌کند. خود Spark Manager و packageهای مشترک سیستم مثل Docker/Nginx/Node/Certbot نگه داشته می‌شوند تا نصب مجدد ممکن باشد.
- `Uninstall Spark Manager` — فقط command و فایل‌های نصب‌شده Manager را حذف می‌کند و Runtime پروژه را دست نمی‌زند.

Full removal عمداً packageهای مشترک سیستم و ruleهای عمومی SSH/HTTP/HTTPS را حذف نمی‌کند؛ این‌ها ممکن است برای سرویس‌های غیر Spark نیز استفاده شوند.

## دسترسی Database و Supabase Studio

ساختار عمداً ساده است:

- Database به‌صورت داخلی روی `127.0.0.1:5433` باقی می‌ماند.
- با `Open Database` یک listener روی Host `5432` ایجاد می‌شود و به listener داخلی هدایت می‌شود.
- با `Close Database` همان listener حذف می‌شود.
- Supabase Studio با `Open Supabase Studio` روی HTTPS پورت `8443` در Nginx در دسترس قرار می‌گیرد.
- با `Close Supabase Studio` listener/config مربوط به `8443` حذف می‌شود.
- اگر UFW فعال باشد، Manager هنگام Open/Close rule ساده‌ی همان پورت را اضافه/حذف می‌کند.
- اگر UFW فعال نباشد، Manager فقط هشدار می‌دهد و عملیات Open/Close را متوقف نمی‌کند؛ در این حالت Firewall/ACL بیرونی سرور تعیین‌کننده دسترسی شبکه است.

## Logging

logهای عملیاتی در:

```text
/var/log/spark-manager/
```

ذخیره می‌شوند. کلید `L` امکان مرور logهای اخیر را در پنل Output می‌دهد.
Crashهای خود renderer در فایل زیر ثبت می‌شوند:

```text
/var/log/spark-manager/ui-crash.log
```

## Update برنامه

Update Production فقط کد و Runtime برنامه را به‌روزرسانی می‌کند و به Database migrationها دست نمی‌زند:

1. `origin/main` fetch و fast-forward بودن بررسی می‌شود.
2. build و validation ابتدا در worktree موقت انجام می‌شود.
3. قبل از deploy backup Runtime گرفته می‌شود.
4. Frontend و Edge Functions خارج از مسیر live آماده و سپس controlled swap می‌شوند.
5. در failure، Runtime به نسخه قبلی rollback می‌شود.
6. اعمال و مدیریت migrationهای Database خارج از Update است و به‌صورت دستی انجام می‌شود.

## ایمنی

- Manager نیاز به root دارد و در صورت نیاز با `sudo` دوباره اجرا می‌شود.
- migration قبلی ویرایش نمی‌شود.
- Update روی repository dirty متوقف می‌شود.
- `npm audit fix` واقعی اجرا نمی‌شود؛ فقط `--dry-run` وجود دارد.
- پورت‌های مدیریتی `5432` و `8443` به‌صورت پیش‌فرض بسته‌اند و فقط با Action صریح Open باز می‌شوند؛ Close همان listener را حذف می‌کند.
- عملیات حذف فقط روی مسیرها و اجزای Spark انجام می‌شود؛ حذف Database در صورت عدم تشخیص قطعی mount متوقف می‌شود.
- Full removal دو تأیید مستقل می‌خواهد و packageهای مشترک سیستم را پاک نمی‌کند.
- Bootstrap ابتدا Bash/Python syntax و UI self-test را اجرا می‌کند و نصب را atomically جایگزین می‌کند؛ در smoke-test ناموفق نسخه قبلی restore می‌شود.
- از lint در workflow Manager استفاده نمی‌شود.

## نصب و مدیریت LiveKit از Spark Manager

مراحل 19 تا 21 پلتفرم کامل LiveKit را نصب می‌کنند: Configuration/TLS/Secrets، Runtime شامل SFU/Redis/Egress/Ingress/TURN و سپس validation کامل. در Single Host، Nginx اصلی Spark مالک 80/443 می‌ماند و Caddy مستقل LiveKit profile-gated است. Dashboard همچنین Diagnostic، Restart و Cleanup اختصاصی LiveKit دارد.
