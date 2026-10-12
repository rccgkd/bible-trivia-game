# Deployment guide

This guide is for the person who looks after the site. Everything is done in your web browser on github.com. You never need to type a command.

## How publishing works

The site is published by **GitHub Pages**. A robot called **GitHub Actions** does the work:

1. Whenever a change is merged into the `main` branch, the robot builds the site.
2. It checks all 750 questions and checks that no file is missing.
3. If everything is fine, it publishes the new version. If anything is wrong, it stops and the live site stays exactly as it was.

The live address is `https://rccgkd.github.io/bible-trivia-game/`.

## One-time setup (do this once, when you merge the redesign)

1. Open the repository on github.com.
2. Click **Settings** (top row of tabs).
3. In the left menu click **Pages**.
4. Under **Build and deployment**, find **Source** and choose **GitHub Actions**.

You should now see a note saying the site is built by a GitHub Actions workflow. Settings save by themselves.

> If you merge before changing this setting, the site keeps working from the files in the repository, and the robot's last step shows a red cross. Change the setting, then open the **Actions** tab, click **Build and deploy**, click **Run workflow**, and press the green button.

## Review the redesign and merge it (or throw it away)

All redesign work lives on a separate branch called `rebrand/premium-redesign`, so the live site has not changed.

1. Click the **Pull requests** tab, then open the pull request titled for the redesign.
2. Scroll to the **Checks** box at the bottom. Wait for a **green tick** next to *Build and check*. A red cross means something needs fixing; click **Details** to read why.
3. Click the **Files changed** tab to see exactly what is different.
4. To preview the page before it goes live: open the **Actions** tab, click the latest run for the pull request, and scroll to **Artifacts**. The `lighthouse-report` file contains a score report (open the `.html` file inside). GitHub Pages cannot show a live preview of a pull request, so the safest way to try the new version is to merge it: you can undo it in a few clicks (see *Roll back* below).
5. To publish: go back to the **Conversation** tab, click **Merge pull request**, then **Confirm merge**.
6. To discard it instead: click **Close pull request**. Nothing changes on the live site.

## Check whether a deployment worked

1. Click the **Actions** tab.
2. The newest line at the top is the latest attempt. A **green tick** means the site is live. A **red cross** means it stopped before publishing, and the live site is unchanged.
3. Click the line, then click **Build and check** to see the steps. The step with the red cross has the message. Common ones:

| Message | Meaning and fix |
|---|---|
| `Question 123: needs exactly four non-empty options` | A question was edited incorrectly in `js/questions.js`. Open the file, fix that entry (see [CUSTOMIZING.md](CUSTOMIZING.md)), and save. |
| `refers to "..." but that file does not exist` | A file was renamed or deleted but the page still points to it. Restore the file or fix the name. |
| `site.json: "url" must start with https://` | The site address in `site.json` is malformed. It must look like `https://name.github.io/repo/` and end with a slash. |
| Publish step fails with *Pages not enabled* | Do the one-time setup above. |

The **Lighthouse report** step only reports scores. A low score shows a warning and never blocks publishing.

## Update content

Edit any file on github.com: open it, click the pencil icon, make the change, and press **Commit changes**. Choosing **Commit directly to the main branch** publishes in about a minute. For anything you want checked first, choose **Create a new branch** and open a pull request instead.

See [CUSTOMIZING.md](CUSTOMIZING.md) for which file to change.

## Roll back to an earlier version

Every version is kept in GitHub's history, so nothing is lost.

**Undo the whole redesign (or any merged pull request):**
1. Open the **Pull requests** tab, click **Closed**, and open the one you want to undo.
2. Click **Revert** near the bottom of the page, then **Create pull request**, then **Merge pull request**.
3. Wait for the green tick in the **Actions** tab. The previous version is live again.

**Undo a single edit:**
1. Open the **Code** tab and click the number of commits (shown with a clock icon).
2. Click the commit you want to undo, then click the **…** menu at the top right and choose **Revert**.
3. Create and merge the pull request as above.

## Use your own web address (custom domain)

1. Buy a domain from any registrar.
2. In the repository open **Settings > Pages**. Under **Custom domain**, type your domain (for example `quiz.example.org`) and click **Save**.
3. At your registrar, open the DNS settings and add the records GitHub lists in [its custom domain guide](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site). For a subdomain such as `quiz`, this is one **CNAME** record pointing to `rccgkd.github.io`.
4. Back in **Settings > Pages**, wait for the green **DNS check successful** message, then tick **Enforce HTTPS**.
5. Open `site.json` on GitHub, click the pencil icon, change the address to `https://quiz.example.org/` (keep the slash at the end) and commit. This keeps search results and link previews correct.
6. In the Firebase console, add the new domain under **Build > Authentication > Settings > Authorized domains** (see [FIREBASE_SETUP.md](FIREBASE_SETUP.md)).

## Turn on GitHub's free security helpers

1. **Settings > Code security** (or *Code security and analysis*).
2. Switch on **Dependabot alerts** and **Dependabot security updates**.
3. Switch on **Secret scanning** and **Push protection**. GitHub then warns you if a password or key is ever committed by accident.
4. Switch on **Private vulnerability reporting** so people can report problems privately (this powers the *Security* tab link in `SECURITY.md`).

The **CodeQL security scan** runs by itself every week and on every change. Its findings appear under **Security > Code scanning**. Dependabot opens a monthly pull request when the automation needs updating; review it and click **Merge pull request** when the checks are green.
