# Deploying to a Google Cloud e2-micro VM

Targets: Ubuntu 24.04 LTS, standard x86_64 (not ARM), e2-micro (~1GB RAM). One Node
process serves both the API and the built React client on the same origin; PM2 keeps it
running; Nginx sits in front on port 80/443.

Everything below runs **on the VM**, connected via the GCP Console's browser SSH button,
as the non-root user it drops you in as (`sudo` where needed — never `su root` or run the
app itself as root).

## 0. Before you start

- Create the VM as e2-micro, Ubuntu 24.04 LTS, and tick **"Allow HTTP traffic"** /
  **"Allow HTTPS traffic"** under Firewall in the creation screen. Unlike some other
  clouds, that's sufficient at the network level — no separate OS-side iptables setup is
  needed on GCP's default Ubuntu image.
  - If something's still unreachable later, the one thing worth checking on the VM
    itself is `sudo ufw status` — it should say `inactive`. If it's `active` and blocking
    80/443, either `sudo ufw allow 80/tcp` and `sudo ufw allow 443/tcp`, or disable it
    with `sudo ufw disable` if you're not intentionally using it.
- This app requires **Node.js 22.13+ or 23.4+** (it uses the built-in `node:sqlite`
  module) — the NodeSource setup below installs a current Node 22, which satisfies this;
  just sanity-check the version after installing.

## 1. Swap space — do this FIRST

e2-micro has ~1GB of RAM, and the client build step (`vite build`) can OOM on that little
without swap. Add 2GB before running any `npm install`:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # sanity check -- should now show ~2.0G under Swap
```

## 2. Node.js and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # confirm this shows v22.13.0 or later
sudo npm install -g pm2
```

## 3. Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

## 4. Clone the repo and configure environment

```bash
git clone https://github.com/huynd140196/bench.git
cd bench
```

**Server config** — copy the example and fill in real values:

```bash
cp bench-fullstack/server/.env.example bench-fullstack/server/.env
nano bench-fullstack/server/.env   # or your editor of choice
```

- `JWT_SECRET` — generate a real one: `openssl rand -hex 32`, paste the output in.
- `ADMIN_LOGIN_PATH` — pick an unguessable slug by hand (the whole point is that it's
  never linked from anywhere and isn't guessable). `openssl rand -hex 8` is a convenient
  way to generate the random part; prefix it with something memorable if you like, e.g.
  `admin-a1b2c3d4e5f6...`.
- Leave `ADMIN_EMAIL` **commented out for now** — see step 7, it can only be set after
  the admin account actually exists.
- `CLIENT_ORIGIN` doesn't matter in this deployment (client and API are same-origin in
  production, so CORS is skipped entirely) — fine to leave as-is or delete.

**Client config** — the admin login path also has to be baked into the client build, and
has to match `bench-fullstack/server/.env` exactly. `bench-fullstack/client/.env.production`
(committed to the repo, non-secret) already sets `VITE_API_URL=/api`; create
`bench-fullstack/client/.env` alongside it for the one value that *is* secret:

```bash
echo 'VITE_ADMIN_LOGIN_PATH=<the exact same slug you put in bench-fullstack/server/.env>' > bench-fullstack/client/.env
```

## 5. First build

From the repo root:

```bash
npm run build
```

This runs `cd bench-fullstack/client && npm install && npm run build`, producing
`bench-fullstack/client/dist`. On an e2-micro this can take a few minutes and lean on the
swap space from step 1 — that's expected, let it finish. You also need the server's own
dependencies:

```bash
cd bench-fullstack/server && npm install && cd ../..
```

## 6. Start it with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 status   # "bench" should show as online
```

Make it survive reboots:

```bash
pm2 startup   # prints a command starting with "sudo env PATH=..." -- copy/paste and run that exact line
pm2 save
```

Quick check it's actually serving:

```bash
curl http://localhost:4000/api/health   # {"ok":true}
curl -I http://localhost:4000/          # 200, serving bench-fullstack/client/dist/index.html
```

## 7. Create the admin account

The very first account can't be invited by anyone (there's no one yet) — the server
mints a one-time bootstrap invite code on first run and logs it:

```bash
pm2 logs bench --lines 50 --nostream | grep "bootstrap invite code"
```

Visit `http://<VM-external-IP>/signup`, use that code to create your own account, then
go back and finish `bench-fullstack/server/.env`:

```bash
nano bench-fullstack/server/.env   # uncomment ADMIN_EMAIL and set it to the email you just signed up with
pm2 restart bench
```

That account is now the site admin (checked fresh from the DB on every request — no
extra login needed, just refresh). The hidden admin login page lives at
`/<ADMIN_LOGIN_PATH>` from step 4, for future rate-limited admin-only logins.

## 8. Put Nginx in front

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/bench
sudo nano /etc/nginx/sites-available/bench   # set server_name to your domain (or the VM's IP for now)
sudo ln -s /etc/nginx/sites-available/bench /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Site should now be reachable on plain `http://` at port 80.

## 9. HTTPS via certbot

Needs a real domain with an **A record pointing at the VM's external IP** first —
certbot can't issue a certificate for a bare IP address.

One thing worth doing before pointing that A record anywhere: by default a GCP VM's
external IP is **ephemeral** — it can change if the instance is ever stopped and
restarted. Reserve a **static external IP** (free of charge as long as it stays attached
to a running instance) via VPC network → IP addresses in the console, and attach it to
this VM, so your DNS doesn't silently break later.

Once the A record resolves:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

Certbot edits the Nginx config in place to add the 443 block and redirect — that's why
the SSL section in `deploy/nginx.conf.example` is commented out rather than active by
default; certbot generates the real thing for you.

## Day-to-day updates

```bash
cd bench
git pull
npm run build
pm2 restart bench
```
