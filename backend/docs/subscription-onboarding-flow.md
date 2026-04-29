# GateSync Onboarding + Trial Lock + Premium Unlock

This document defines the production flow for website onboarding, free trial, Razorpay payment, and subscription lock behavior.

## 1. User Journey

1. User lands on `gatesync.in`.
2. Clicks `Get Started`.
3. Lands on pricing page with:
   - `Free Trial (2 months)` with full access
   - `Premium` plan(s)
4. If Free Trial selected:
   - Society + Admin onboarding starts immediately.
5. If Premium selected:
   - Create Razorpay order.
   - User pays.
   - Verify payment signature.
   - Activate subscription.
6. Admin can continue onboarding and operations.

## 2. Trial / Grace / Lock Rules

- Trial duration: `SUBSCRIPTION_TRIAL_DAYS` (default `60`)
- Grace period after trial or paid expiry: `SUBSCRIPTION_GRACE_DAYS` (default `7`)
- Trial has full feature access.
- After trial end:
  - During grace: allow access and send reminders.
  - After grace: account becomes `LOCKED`.
- Locked state:
  - Write actions blocked by backend middleware.
  - Billing/upgrade endpoints remain accessible.
  - Payment success unlocks immediately.

## 3. Backend APIs

Base: `/api/v1/subscriptions`

- `GET /plans` (public)
  - Returns trial + paid catalog
- `GET /me` (auth)
  - Returns current subscription status for logged-in society
- `POST /create-order` (auth: ADMIN/MANAGER/SUPERADMIN)
  - Input: `plan_code` (`PRO_MONTHLY` / `PRO_YEARLY`)
  - Creates Razorpay order and logs payment row
- `POST /confirm-payment` (auth: ADMIN/MANAGER/SUPERADMIN)
  - Input:
    - `plan_code`
    - `razorpay_order_id`
    - `razorpay_payment_id`
    - `razorpay_signature`
  - Verifies signature and activates subscription

## 4. Middleware Lock Enforcement

Global middleware `subscriptionGuard` blocks write methods (`POST`, `PUT`, `PATCH`, `DELETE`) when subscription is locked.

Allowed in locked state:
- `/api/v1/subscriptions/*`
- `/api/v1/auth/push-token`

Blocked responses return:
- HTTP `402`
- code: `SUBSCRIPTION_LOCKED`

## 5. Reminder Job

Script: `npm run subscriptions:send-reminders`

Trigger points:
- Trial: day `15`, `7`, `3`, `1` before expiry
- Grace: day `7`, `3`, `1` before hard lock
- Locked: one-time lock reminder (`LOCKED_UPGRADE_REQUIRED`)

Recipients:
- Active `ADMIN` and `MANAGER` users of the society

Deduplication:
- `society_subscription_reminders` table unique key prevents duplicate same-trigger sends.

## 6. Required Environment Variables

Add these in `backend/.env`:

```env
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
SUBSCRIPTION_TRIAL_DAYS=60
SUBSCRIPTION_GRACE_DAYS=7
SUBSCRIPTION_PRICE_PER_UNIT_PAISE=1000
```

Optional reminder channel config (already used by existing SMS service):

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

## 7. Database Upgrade

Run once on server:

```bash
cd /var/www/gatesync/backend
npm run upgrade:subscription
```

## Pricing Logic

- Monthly amount = `declared_total_flats * SUBSCRIPTION_PRICE_PER_UNIT_PAISE`
- Annual amount = `monthly amount * 12`
- Declared units are taken from `societies.total_flats`
- Flat creation is blocked when current flats exceed declared unit quota

## 8. Reminder Cron (EC2)

Run every day at 10:00 AM:

```bash
crontab -e
```

Add:

```cron
0 10 * * * cd /var/www/gatesync/backend && /usr/bin/npm run subscriptions:send-reminders >> /var/log/gatesync-subscription-reminders.log 2>&1
```

## 9. Recommended Frontend Next Step

Implement pricing page + onboarding flow:

1. Pricing page calls `GET /api/v1/subscriptions/plans`
2. Premium button calls `POST /create-order`
3. Razorpay checkout completes
4. Call `POST /confirm-payment`
5. Refresh session (`/api/v1/auth/me`) to get updated `subscription`
