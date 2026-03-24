# GateSync Backend Deploy on EC2

This document captures the working backend deployment flow for GateSync on an Ubuntu EC2 instance, with:

- Node.js backend
- PM2 process manager
- Nginx reverse proxy
- HTTPS on `api.gatesync.in`
- Private AWS RDS MySQL as the database

Use this together with [aws-rds-setup.md](/c:/Users/visha/.gemini/antigravity/scratch/gatepulse/backend/docs/aws-rds-setup.md).

## Current Deployment Shape

- EC2 public IP: `3.25.254.0`
- API domain: `api.gatesync.in`
- Backend app port: `5000`
- Public web port: `80`
- HTTPS port: `443`
- Database host: `gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com`
- Database name in RDS: `gatepulse`

Important:
- Backend should run on EC2, not on a laptop
- RDS is private, so local machine to RDS will time out

## 1. EC2 Security Group

For the backend EC2 security group:

Inbound:
- `22` from your IP
- `80` from `0.0.0.0/0`
- `443` from `0.0.0.0/0`

Do not expose `5000` publicly if Nginx is being used.

## 2. Install Base Packages

```bash
sudo apt update
sudo apt install -y git curl nginx
```

## 3. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Install PM2

```bash
sudo npm install -g pm2
pm2 -v
```

## 5. Clone the Project

```bash
cd /var/www
sudo mkdir -p /var/www/gatesync
sudo chown -R $USER:$USER /var/www/gatesync
cd /var/www/gatesync
git clone https://github.com/vmehta0387/GateSync.git .
```

## 6. Prepare Backend Environment

Go to backend:

```bash
cd /var/www/gatesync/backend
```

Copy the production env template:

```bash
cp .env.production.example .env
nano .env
```

Use values like:

```env
PORT=5000
DB_HOST=gatesync.c9ogwqy2s185.ap-southeast-2.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=REPLACE_WITH_RDS_PASSWORD
DB_NAME=gatepulse
JWT_SECRET=REPLACE_WITH_STRONG_SECRET
OPENAI_API_KEY=your_openai_api_key_here
```

Important:
- `DB_NAME` should currently be `gatepulse`
- remove any duplicate `DB_*` lines

## 7. Install Dependencies

```bash
npm install
```

## 8. Run Backend with PM2

An ecosystem file already exists:

- [ecosystem.config.cjs](/c:/Users/visha/.gemini/antigravity/scratch/gatepulse/backend/ecosystem.config.cjs)

Start it:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

If `pm2 startup` prints another command, copy-paste and run that command once.

Check status:

```bash
pm2 status
pm2 logs gatesync-backend
```

## 9. Local Health Check on EC2

Before touching Nginx, verify the app itself:

```bash
curl http://127.0.0.1:5000/api/health
```

Expected:

```json
{"status":"OK","message":"GatePulse API is running"}
```

## 10. Nginx Reverse Proxy

Create config:

```bash
sudo nano /etc/nginx/sites-available/gatesync-backend
```

Use this exact config:

```nginx
server {
    listen 80;
    server_name api.gatesync.in;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/gatesync-backend /etc/nginx/sites-enabled/gatesync-backend
```

Disable the default site if needed:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Now this should work:

```bash
curl http://api.gatesync.in/api/health
```

## 11. DNS for API Subdomain

At the DNS provider for `gatesync.in`, create:

- Type: `A`
- Host/Name: `api`
- Value: `3.25.254.0`

That maps:

- `api.gatesync.in` -> `3.25.254.0`

## 12. HTTPS with Certbot

Install certbot:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

Request certificate:

```bash
sudo certbot --nginx -d api.gatesync.in
```

If the certificate is created but not installed, the usual cause is:
- Nginx server block does not have the exact `server_name api.gatesync.in;`

Fix that, then run:

```bash
sudo certbot install --cert-name api.gatesync.in
```

Check renewal:

```bash
sudo certbot renew --dry-run
```

## 13. Final HTTPS Test

```bash
curl https://api.gatesync.in/api/health
```

Expected:

```json
{"status":"OK","message":"GatePulse API is running"}
```

## 14. Common Problems

### `curl http://127.0.0.1:5000/api/health` works but public domain shows Nginx 404

Cause:
- default Nginx site is serving
- custom proxy site is not enabled or not matching host

Fix:
- remove `/etc/nginx/sites-enabled/default`
- ensure custom config is linked
- ensure `server_name api.gatesync.in;`
- reload Nginx

### Certbot says it cannot find a matching server block

Cause:
- `server_name` is `_` or missing

Fix:
- set:

```nginx
server_name api.gatesync.in;
```

### Backend logs show `connect ETIMEDOUT`

Cause:
- backend is being run from a machine outside the private VPC

Fix:
- run backend on EC2
- do not try to run laptop backend directly against private RDS

## 15. Updating the Backend Later

On EC2:

```bash
cd /var/www/gatesync
git pull origin main
cd backend
npm install
pm2 restart gatesync-backend
```

Check:

```bash
pm2 logs gatesync-backend
curl https://api.gatesync.in/api/health
```

## 16. Recommended Next Step

After backend is stable:
- update frontend API URLs to `https://api.gatesync.in`
- update mobile app `apiBaseUrl` and `socketUrl`
- later add frontend domain and HTTPS
