# FX Setup Desk

A rule-based forex setup scanner for Android. It flags rule matches. It does not predict prices and is not financial advice.

## Install the app
1. Create a free GitHub account and a new **public** repository named `fx-desk`.
2. Upload every file in this folder, keeping the `.github` folder. Use a computer: GitHub's upload page is easier there, and hidden folders may need showing first.
3. In the repository, open **Settings > Pages**. Under Branch, choose `main`, then **Save**.
4. After a minute or two, open `https://YOUR-USERNAME.github.io/fx-desk/` in Chrome on your phone.
5. Tap the Chrome menu, then **Add to Home screen** or **Install app**.
6. Open the app and paste your free Twelve Data key. Without it you see made-up sample prices.

## Turn on alerts
1. Install **ntfy** from Google Play.
2. In ntfy, subscribe to a long, random topic name that only you know, for example `fxdesk-7k2p9q4xw8`. Anyone who knows the name can read or send messages on it.
3. In the repository, open **Settings > Secrets and variables > Actions**. Add two secrets:
   - `TWELVE_DATA_KEY`: your Twelve Data key
   - `NTFY_TOPIC`: your topic name
4. Open **Actions > FX setup alerts > Run workflow**, keep "Send a test notification" ticked, and run it. Your phone should get a message listing each pair.

## Good to know
- Your keys in Secrets are not visible in the public repository. Never put them in a file.
- GitHub can run scheduled jobs late, sometimes by many minutes, and may skip some. By then the price may have moved, so don't rely on alerts for timing.
- GitHub may pause schedules after 60 days with no repository activity. It emails you, and you can turn them back on from the Actions tab.
- Alerts use up to 364 of the 800 free daily Twelve Data requests. The app stops itself at 400 for the day.
- To only get alerts when the past test shows an edge, change `ONLY_PROVEN` to `"true"` in `.github/workflows/alerts.yml`. Set `SPREAD_PIPS` to your broker's spread there too.
