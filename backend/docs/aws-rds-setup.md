# GateSync AWS MySQL Setup

This document captures the working setup and migration flow for moving the GateSync database from local MySQL to AWS RDS.

## Current Target

- RDS endpoint: `gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com`
- Port: `3306`
- Master user: `admin`
- App database in RDS: `gatepulse`

Important:
- The imported database currently exists as `gatepulse`
- A separate empty database named `gatesync` may also exist
- The backend should use `DB_NAME=gatepulse` unless the data is re-imported into `gatesync`

## Architecture Note

The current RDS is private.

That means:
- `EC2 -> RDS` works
- `Local laptop -> RDS` times out
- Running the backend locally against this RDS will fail with `ETIMEDOUT`

So the correct production path is:
- backend on EC2
- database on private RDS

## 1. Create / Verify RDS

Recommended RDS settings:
- Engine: MySQL
- Port: `3306`
- Public access: `No` for production
- Security group inbound: allow `3306` from the backend EC2 security group, not `0.0.0.0/0`

If local direct access is required temporarily:
- either make RDS publicly accessible and restrict to your public IP
- or use an SSH tunnel / bastion host

## 2. Local Source Database

The local project originally uses:

```env
DB_HOST=localhost
DB_USER=gatepulse
DB_PASSWORD=<local-password>
DB_NAME=gatepulse
```

## 3. Dump Local Database

Use `cmd` or non-PowerShell redirection if possible. PowerShell `>` can create UTF-16 files, which break MySQL import.

Preferred command:

```powershell
cmd /c "mysqldump -h localhost -P 3306 -u gatepulse -p --databases gatepulse --single-transaction --quick --routines --triggers --events --set-gtid-purged=OFF --column-statistics=0 > c:\path\to\gatepulse-full.sql"
```

If you already created the dump from PowerShell and it is UTF-16, convert it on EC2 before importing.

## 4. Upload Dump to EC2

Example using PuTTY `pscp`:

```powershell
pscp -i "C:\path\to\key.ppk" "c:\path\to\gatepulse-full.sql" ubuntu@<ec2-public-ip>:/home/ubuntu/
```

Or use WinSCP over SFTP.

Verify on EC2:

```bash
ls -lh /home/ubuntu/gatepulse-full.sql
```

## 5. If Dump File Is UTF-16

Detect it:

```bash
file /home/ubuntu/gatepulse-full.sql
head -n 5 /home/ubuntu/gatepulse-full.sql
```

If the file says `UTF-16 little-endian`, convert it:

```bash
iconv -f UTF-16LE -t UTF-8 /home/ubuntu/gatepulse-full.sql > /home/ubuntu/gatepulse-full-utf8.sql
```

Verify:

```bash
file /home/ubuntu/gatepulse-full-utf8.sql
head -n 5 /home/ubuntu/gatepulse-full-utf8.sql
```

The top of the file should be readable SQL text beginning with MySQL dump comments.

## 6. Import into RDS from EC2

Create the target database if needed:

```bash
mysql -h gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com -P 3306 -u admin -p -e "CREATE DATABASE IF NOT EXISTS gatepulse;"
```

Import:

```bash
mysql --default-character-set=utf8mb4 -h gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com -P 3306 -u admin -p gatepulse < /home/ubuntu/gatepulse-full-utf8.sql
```

Notes:
- If your dump was created with `--databases gatepulse`, it may create and use `gatepulse` internally
- That is why the imported app database currently exists as `gatepulse`

## 7. Verify Import

Check databases:

```bash
mysql -h gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com -P 3306 -u admin -p -e "SHOW DATABASES;"
```

Check tables:

```bash
mysql -h gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com -P 3306 -u admin -p -e "USE gatepulse; SHOW TABLES;"
```

Check a few row counts:

```bash
mysql -h gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com -P 3306 -u admin -p -e "USE gatepulse; SELECT COUNT(*) AS users_count FROM Users; SELECT COUNT(*) AS flats_count FROM Flats; SELECT COUNT(*) AS visitors_count FROM Visitor_Logs;"
```

## 8. Backend `.env` for RDS

Use this on the machine that can actually reach the private RDS, typically EC2:

```env
PORT=5000
DB_HOST=gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=<rds-password>
DB_NAME=gatepulse
JWT_SECRET=supersecret_jwt_gatepulse_token
OPENAI_API_KEY=your_openai_api_key_here
```

Important:
- Remove duplicate `DB_*` entries from `.env`
- The backend reads the last matching env value if duplicates remain

## 9. Why Local Backend Times Out

If you see:

- `MySQL Database connection failed: connect ETIMEDOUT`
- `sendOtp error: connect ETIMEDOUT`

that usually means:
- backend is being run from your laptop
- RDS is private and not reachable from the laptop

This is not a SQL syntax problem. It is a network access problem.

## 10. Recommended Production Setup

- Backend runs on EC2 in the same VPC as RDS
- RDS remains private
- Security group allows MySQL only from backend EC2
- Mobile app and frontend talk to the backend API, never directly to MySQL

## 11. Common Issues

### `ASCII '\0' appeared in the statement`

Cause:
- dump file transferred or created in UTF-16 / binary-unfriendly mode

Fix:
- convert with `iconv`
- import the UTF-8 file

### `ERROR 1064 at line 1`

Cause:
- dump file is not plain SQL text

Fix:
- inspect with `file`, `head`, and `xxd`
- convert UTF-16 to UTF-8

### `SHOW TABLES` returns blank in `gatesync`

Cause:
- dump actually imported into `gatepulse`

Fix:
- use `DB_NAME=gatepulse`
- or re-import cleanly into `gatesync` later

## 12. Safe Next Step

After import:
1. clean `backend/.env`
2. run backend from EC2, not from laptop
3. verify `/api/v1/auth/send-otp` and a few core APIs
