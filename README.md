# Earning Money — Task & Wallet Platform

A mobile-first Node.js/Express + SQLite starter based on the provided visual references. The branding is intentionally set to **Earning Money**.

## Included
- Responsive mobile-first Home, Product, Task, Recharge, Withdraw, Community, News and Me pages
- Email/password registration and login, bcrypt password hashing, signed JWT sessions
- SQLite database for users, wallets, tasks, submissions, transactions and ledger entries
- Task submissions with admin approval before rewards are credited
- Recharge requests with admin review before deposits are credited
- Withdrawal requests reserve earnings while pending; rejection returns the reserved amount
- Admin panel for transaction review, task review, and task creation
- Basic auth rate limiting and server-side validation

## Requirements
- Node.js 18+ (20+ recommended)
- npm

## Run locally
```bash
npm install
cp .env.example .env
# Edit .env and set a strong unique JWT_SECRET and ADMIN_PASSWORD.
npm start
```
Open http://localhost:3000

The database file `data.sqlite` is created automatically. The first admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first start. If using the defaults, change them before exposing the app to the internet.

## Before production
This is a starter, not a fully audited financial product. Before handling real money:
- Use HTTPS and a long random JWT secret, secure environment secrets, backups, monitoring and a managed database strategy.
- Integrate a legitimate payment provider; verify callbacks/signatures server-side. Do not credit deposits solely from a user-submitted reference.
- Add CSRF/origin protections as appropriate, email verification, password reset, stronger session revocation, audit logs, admin MFA, authorization tests and abuse prevention.
- Add idempotency, reconciliation and a double-entry ledger; review concurrency and withdrawal reservation flows.
- Publish clear terms, privacy policy, eligibility and fee rules. Do not promise guaranteed income or use misleading projected returns.
- Check local laws and payment-provider rules before enabling deposits, paid packages, referral rewards or withdrawals.
- Replace the Earning Money branding only if you later choose a different name, placeholder artwork, example tasks and sample packages with assets and content you own or are authorized to use.

## Notes
- The Product page uses illustrative free sample packages; package purchase is deliberately disabled.
- The demo currency is BDT and labels are editable.
- Do not copy another company's trademarks, logos, or proprietary assets.
