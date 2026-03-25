# Resident Access Upgrade

This upgrade adds flat-level resident app access roles so each flat can support:

- one `Primary` resident account
- one `Secondary` resident account

Both can receive notifications, and visitor approval routing now respects resident approval permissions.

## What changes in the database

The upgrade adds this column to `user_flats`:

```sql
access_role ENUM('Primary', 'Secondary') NOT NULL DEFAULT 'Primary'
```

Existing rows are backfilled to:

```sql
Primary
```

## When to run this

Run this after pulling the latest backend code to the EC2 instance that connects to AWS RDS.

This should be run on the server, not on a local machine, because your RDS instance is private and reachable from EC2.

## EC2 deploy steps

1. SSH into the EC2 instance
2. Switch to the deploy user if needed

```bash
su - ubuntu
```

3. Pull latest code

```bash
cd /var/www/gatesync
git pull origin main
```

4. Move into backend

```bash
cd /var/www/gatesync/backend
```

5. Confirm `.env` is pointing at AWS RDS

Expected values should look like:

```env
DB_HOST=gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=YOUR_PASSWORD
DB_NAME=gatepulse
```

6. Run the upgrade

```bash
npm run upgrade:resident-access
```

Expected success output:

```text
Resident access roles upgraded successfully.
```

7. Restart backend

If you use PM2 ecosystem config:

```bash
pm2 restart ecosystem.config.cjs --update-env
```

If your backend is running under a named PM2 process:

```bash
pm2 list
pm2 restart <name-or-id> --update-env
```

## Verification

Check local backend health:

```bash
curl http://127.0.0.1:5000/api/health
```

Check public API health:

```bash
curl https://api.gatesync.in/api/health
```

## Admin follow-up after the upgrade

After the migration:

- all existing resident-flat mappings will be `Primary`
- if a flat has two app users, edit one of them and set the role to `Secondary`

The admin resident forms now support:

- `App Access Role = Primary`
- `App Access Role = Secondary`

## Important rule

Each flat should have at most:

- one `Primary`
- one `Secondary`

If you try to assign the same access role twice for the same flat, the backend returns a conflict error.

## Bulk import support

Resident bulk import now supports:

```text
access_role
```

Allowed values:

- `Primary`
- `Secondary`

If blank, the system defaults to `Primary`.

## Related files

- `backend/src/config/upgradeResidentAccessModule.js`
- `backend/src/controllers/residentController.js`
- `backend/src/controllers/visitorController.js`
- `backend/src/services/pushNotificationService.js`

