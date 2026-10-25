# Deploying GradeAI on Oracle Cloud (Always Free)

This runs the whole stack on one free Oracle Cloud VM with HTTPS, using
`docker-compose.prod.yml`. Total time: about an hour, most of it waiting for
the first image build.

What you end up with:

- `https://<your-name>.duckdns.org`, with a free, auto-renewing Let's Encrypt
  certificate (handled by Caddy).
- Only ports 22, 80 and 443 open. Postgres, Redis, MinIO and ChromaDB are
  reachable only inside Docker.
- The app in production mode: strong generated secrets, professor sign-up
  protected by a registration code, API docs disabled.

The stack uses about 1.5 GB of RAM, so it fits comfortably in the free ARM VM.

---

## 1. Create the VM

1. Sign up at <https://www.oracle.com/cloud/free/>. A card is needed for
   verification; Always Free resources are not charged.
2. **Compute → Instances → Create instance**
   - **Image:** Canonical Ubuntu 24.04 (or 22.04)
   - **Shape:** Ampere → `VM.Standard.A1.Flex`, **2 OCPU, 12 GB memory**
     (the Always Free ARM allowance)
   - **Networking:** keep the default VCN and public subnet; make sure
     "Assign a public IPv4 address" is on
   - **SSH keys:** "Generate a key pair for me" and download the private key,
     or paste your own public key
   - **Boot volume:** the default (~47 GB) is enough
3. If you get "Out of capacity", try another availability domain or try again
   later. ARM capacity in popular regions fills up.
4. Note the instance's **public IP address**.

## 2. Open ports 80 and 443

Oracle has two firewalls. Both must allow web traffic.

**a) Cloud firewall (security list).** Networking → Virtual cloud networks →
your VCN → Security Lists → Default Security List → **Add Ingress Rules**:

| Source CIDR | IP protocol | Destination port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

**b) The VM's own firewall.** Oracle's Ubuntu images ship with iptables rules
that reject everything except SSH. Do this after connecting in step 4.

## 3. Get a free domain

HTTPS certificates need a domain name.

1. Go to <https://www.duckdns.org>, sign in, and create a subdomain, for
   example `gradeai-yourname`.
2. Set its IP to your VM's public IP and click **update ip**.
3. Check it from your laptop: `ping gradeai-yourname.duckdns.org` should show
   the VM's IP.

## 4. Prepare the server

```bash
# From your laptop (use the key you downloaded)
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
```

On the VM:

```bash
# Allow HTTP/HTTPS through the VM firewall and keep the rules after reboot
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Updates and Docker (the official script supports ARM)
sudo apt-get update && sudo apt-get -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# Log out and back in so the docker group applies
exit
```

```bash
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
docker run --rm hello-world   # should print "Hello from Docker!"
```

## 5. Deploy

```bash
git clone https://github.com/Iampranjaldubey/Grade.AI.git
cd Grade.AI

# Creates .env.prod with random database/storage/JWT secrets.
# Asks for your domain and Gemini key (the key isn't echoed).
./scripts/init-prod-env.sh

# Build and start everything. The first build takes 10-20 minutes on the ARM VM.
./scripts/prod.sh up
```

`init-prod-env.sh` prints a **professor registration code**. Save it: anyone
signing up as a professor needs it. Students don't.

Wait a minute for Caddy to get the certificate, then check:

```bash
./scripts/prod.sh status     # every container healthy + {"status":"ok",...}
```

Open `https://gradeai-yourname.duckdns.org`.

### Demo data (recommended for a portfolio link)

```bash
./scripts/prod.sh seed-demo
```

This creates the same demo course and accounts as locally
(`prof.demo@example.com` / `demo-pass-123`, etc.), so recruiters can log in
and look around.

## 6. Day-to-day commands

| Task | Command |
| --- | --- |
| Status and health | `./scripts/prod.sh status` |
| Logs (all, or one service) | `./scripts/prod.sh logs` / `./scripts/prod.sh logs celery-worker` |
| Deploy new code | `git pull && ./scripts/prod.sh up` |
| Database backup | `./scripts/prod.sh backup` (writes `backups/*.sql.gz`) |
| Stop (keeps data) | `./scripts/prod.sh down` |

Daily backup at 03:00, keeping 14 days:

```bash
(crontab -l 2>/dev/null; echo '0 3 * * * cd ~/Grade.AI && ./scripts/prod.sh backup && ls -1t backups/*.sql.gz | tail -n +15 | xargs -r rm') | crontab -
```

Restore a backup:

```bash
gunzip -c backups/<file>.sql.gz | ./scripts/prod.sh compose exec -T postgres psql -U gradeai gradeai
```

## 7. Good to know

- **Idle reclamation.** Oracle may reclaim Always Free VMs that stay almost
  idle for a week (very low CPU, network and memory use). A demo site with
  little traffic can qualify. Upgrading the account to Pay As You Go removes
  that rule; Always Free resources still cost nothing. Either way, keep
  backups.
- **Secrets.** `.env.prod` holds every secret, with permissions 600, and is
  gitignored. Don't commit it or paste it anywhere. Don't regenerate it
  either: the database and storage volumes were created with those passwords.
- **Gemini quota.** Every submission uses your Gemini key. If the quota runs
  out, grades fall back to the flagged placeholder until it resets.
- **Registration.** By default anyone can sign up as a student. Professor
  accounts need the registration code.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Browser can't connect | Both firewalls (step 2), and that the DuckDNS IP matches the VM |
| Certificate error / "connection not secure" | `./scripts/prod.sh logs caddy`. Ports 80 and 443 must be reachable from the internet for Let's Encrypt |
| A container keeps restarting | `./scripts/prod.sh logs <service>`. The backend refuses to start if a required production setting is missing, and says which one |
| Uploads fail | `AWS_S3_PUBLIC_ENDPOINT` in `.env.prod` must be `https://<your domain>` |
| Every grade is a placeholder | `./scripts/prod.sh logs celery-worker` and search for `gemini_`: invalid key, quota, or model errors |
