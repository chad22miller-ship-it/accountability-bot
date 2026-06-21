# Consistency Compounds - Accountability Bot (100% free, GitHub-only)

Runs your daily Telegram check-in **free, forever, with no credit card** - on GitHub's
own machines. Your computer can be off, asleep, or in a drawer; this keeps running.

- Asks every day at **9:00am Eastern** if you've done your check-in.
- You reply **"yes"** -> you get a personalized **win** message back (usually within ~5-15 min).
- No reply? It **nudges you about once an hour**, then **gives up after 12 hours**.
- Resets itself every day, automatically.

It uses only built-in tools - **no third-party libraries** - and costs **$0**.

> How it's free: GitHub Actions runs `bot.js` every few minutes. Each run checks your
> Telegram, sends what's due, and saves its memory back to the repo. GitHub does the
> work, so nothing has to run on your computer.

Setup is ~15 minutes of clicking. No coding required.

---

## STEP 0 - Your values

The only secret (your bot token) is in the separate **`github-secrets.txt`** file - keep
that private and do NOT upload it. Everything else is already set inside the workflow file.

---

## STEP 1 - Create a free GitHub repo (3 min)

1. Sign up / log in at **https://github.com**.
2. Go to **https://github.com/new**.
   - Repository name: `accountability-bot`
   - Choose **Public**. *(This keeps GitHub Actions truly unlimited and free. It's safe -
     there are NO passwords in the code; your token is stored separately as a Secret in Step 3.)*
   - Click **Create repository**.

---

## STEP 2 - Upload the files (3 min)

1. On your new repo page, click **"uploading an existing file"** (or **Add file -> Upload files**).
2. Drag in **everything from this project**, including the **`.github`** folder:
   - `bot.js`
   - `state.json`
   - `.gitignore`
   - `README.md`
   - the `.github` folder (which contains `workflows/bot.yml`)
3. Do **NOT** upload `github-secrets.txt`.
4. Click **Commit changes**.

> Folder upload tip: dragging the whole project folder's contents (with the `.github` folder)
> works in Chrome/Edge. If the workflow file doesn't show up under `.github/workflows/bot.yml`,
> do this instead: **Add file -> Create new file**, type `.github/workflows/bot.yml` as the
> name, paste in the contents of that file, and commit.

---

## STEP 3 - Add your secret token (2 min)

1. In the repo, go to **Settings -> Secrets and variables -> Actions**.
2. Click **New repository secret**.
3. Open **`github-secrets.txt`** and add:
   - Name: `TELEGRAM_BOT_TOKEN`  ->  Value: the token from that file. Click **Add secret**.
4. *(Optional, for AI-written coach lines)* Add another secret:
   - Name: `ANTHROPIC_API_KEY`  ->  Value: your key from https://console.anthropic.com
   - Skip this and it uses built-in coach lines for free.

---

## STEP 4 - Turn it on (1 min)

1. Click the **Actions** tab. If prompted, click **"I understand my workflows, enable them"**.
2. Click **Accountability Bot** in the left list -> **Run workflow** -> **Run workflow**.
   (This runs it once right now so you can test it.)

---

## STEP 5 - Confirm it's alive (1 min)

1. In Telegram, message your bot: **`ping`**
2. Back on the **Actions** tab, click **Run workflow** once more (so it reads your message).
3. Within a moment the bot should reply: *"Online and locked in..."*

If it replies, you're live. From now on it asks you every day at 9am Eastern on its own.

---

## STEP 6 - IMPORTANT: turn off the old Cowork task

Your old Cowork check-in and this bot both read the same Telegram inbox - if both run they'll
fight over your replies. Once Step 5 works, **turn the old one off.**

> Tell Claude in Cowork: *"disable my chad-daily-accountability-checkin scheduled task"*.

---

## What it costs

**Nothing.** No credit card. Public repo = unlimited free GitHub Actions. The optional
Anthropic key (Step 3) costs a few cents a month and is the only thing that ever could.

---

## Change the time or timezone later

Edit **`.github/workflows/bot.yml`** in GitHub (click the file -> pencil icon), change the
values under `env:`, then commit:
- Time: `ASK_HOUR` (24-hour clock) and `ASK_MINUTE`. e.g. 6:30am = `ASK_HOUR: '6'`, `ASK_MINUTE: '30'`.
- Timezone: `TIMEZONE`, e.g. `America/Chicago`, `America/Denver`, `America/Los_Angeles`.

---

## Good to know

- **Timing isn't to-the-second.** GitHub's free scheduler is "best effort" and often runs
  5-15 minutes late. For a daily check-in that's fine - your 9am ask and your win just land
  a few minutes off, never missed.
- **It stays on by itself.** The bot saves its memory daily, which keeps the repo active so
  GitHub never auto-pauses the schedule.

---

## Troubleshooting

- **Nothing happens at all:** Actions tab -> make sure workflows are **enabled**. Open the
  latest run and read the log - if it says "Missing TELEGRAM_BOT_TOKEN", redo Step 3.
- **`ping` gets no reply:** trigger a run (Actions -> Run workflow); replies are read on the
  next run. Also make sure the old Cowork task is off (Step 6).
- **Messages feel generic:** add the `ANTHROPIC_API_KEY` secret (Step 3) for AI-written lines.
- **Test the daily ask now:** in `bot.yml`, set `ASK_HOUR`/`ASK_MINUTE` to a couple minutes
  ahead (remember it's Eastern), commit, wait for the next run, then set it back to 9 / 0.
