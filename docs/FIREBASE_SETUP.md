# Firebase setup guide: live audience voting

This guide is written for someone who has never set up Firebase. It uses only the Firebase website and the GitHub website. You do not need to type any commands.

## What this is, in plain words

**Firebase** is a free service from Google. Kingdom Quiz uses two parts of it:

- **Authentication (anonymous sign-in).** When someone opens the game, Firebase quietly gives their phone a random ID. Nobody creates an account, types a password or shares an email. The ID is only used to say "this phone voted once".
- **Realtime Database.** A small online notebook where the host's screen writes the current question and the audience's phones write their votes. Everyone's screen updates the moment the notebook changes.

Kingdom Quiz has **no accounts, no login page, no stored personal data and no payments**, so it does not use the full sign-up and sign-in system. The security that matters is the **security rules**: a set of instructions that decide who may read or change the notebook. Step 5 installs them.

The game already works for the host without any of this. This guide is only needed for audience voting.

> **Already set up?** This project is already connected to a Firebase project (`kingdom-quiz-feeb8`). Steps 3 to 5 may already be done. Use the checklist at the end of each step to confirm. The most important new thing is **Step 5**: publishing the stronger security rules after the redesign is live.

## Before you start

You need:
- A Google account that owns the Firebase project.
- The project already open at [console.firebase.google.com](https://console.firebase.google.com).

## Step 1. Open your project

1. Go to **console.firebase.google.com** and sign in.
2. Click your project's name (`kingdom-quiz-feeb8`, or the name of your own project).

**You should see:** the project overview page with the project name at the top left.

## Step 2. Register the web app and copy its settings (only for a brand-new project)

Skip this step if you are keeping the existing project: its settings are already in `js/firebase-config.js`.

1. On the overview page click the **`</>`** (Web) icon, or **Project settings** (gear icon, top left) > **General** tab > scroll to **Your apps** > **Add app** > **Web**.
2. Give it a nickname such as *Kingdom Quiz*. **Leave "Firebase Hosting" unticked.** Click **Register app**.
3. Firebase shows a block of code containing `firebaseConfig = { ... }`. Copy only the part between the curly braces.
4. On GitHub open `js/firebase-config.js`, click the pencil icon, replace the values inside `export const firebaseConfig = { ... };` with yours, and **Commit changes**.

**You should see:** your project's `apiKey`, `authDomain`, `databaseURL` and other values in the file.

> **Is it safe to put this in GitHub?** Yes. These values are *identifiers*, like a street address. Every website that uses Firebase shows them to the browser. They are not passwords. The security rules in Step 5 are what protect your data.

## Step 3. Turn on anonymous sign-in

1. In the left menu click **Build** > **Authentication**.
2. If you see a **Get started** button, click it.
3. Click the **Sign-in method** tab.
4. Click **Anonymous**, switch **Enable** on, and click **Save**.

**You should see:** *Anonymous* in the list with the status **Enabled**.

## Step 4. Create the Realtime Database

1. In the left menu click **Build** > **Realtime Database**.
2. Click **Create Database**.
3. Choose the location closest to your audience and click **Next**.
4. Choose **Start in locked mode** and click **Enable**.

**You should see:** an empty database with a web address like `https://your-project-default-rtdb.firebaseio.com`. This address must match `databaseURL` in `js/firebase-config.js`. If your database address uses `.firebasedatabase.app`, that works too.

## Step 5. Install the security rules

The file `database.rules.json` in this repository holds the rules. In plain terms they say:

- Only a signed-in device can open a room, and only the device that created a room can change it.
- Anyone signed in who knows a room code can read that room (so phones can follow the game).
- Each phone can write **only its own vote**, only while voting is open, and only a number from 0 to 3.
- Names, questions and numbers must be a sensible size and shape.
- Everything else is denied.

To install them:

1. On GitHub, open `database.rules.json` and click the **Copy raw file** icon (two squares, top right of the file view).
2. In the Firebase console go to **Build** > **Realtime Database** > **Rules** tab.
3. Select everything in the editor, delete it, and paste what you copied.
4. Click **Publish**.

**You should see:** the message *Your rules have been published* and the new rules in the editor.

> **Order matters.** Publish these rules *after* the redesigned site is live. The redesigned site writes a new `hostUid` field that the rules require. The old site did not, so with these rules the old site could no longer create rooms.

### Optional: test the rules with the Rules Playground

1. In the **Rules** tab click **Rules Playground**.
2. Set **Simulation type** to *Read*, **Location** to `/rooms/ABCD`, switch **Authenticated** on, and click **Run**. Expected: **Simulated read allowed**.
3. Switch **Authenticated** off and run again. Expected: **Simulated read denied**.
4. Set the type to *Write*, location `/rooms/ABCD`, Authenticated on, and data `{"gameState":"PLAYING"}`. Expected: **denied**, because `hostUid` is missing.

## Step 6. Add your website address to the authorized domains

1. Go to **Build** > **Authentication** > **Settings** tab > **Authorized domains**.
2. Click **Add domain** and add `rccgkd.github.io` (and your custom domain, if you have one). `localhost` is added for you.

**You should see:** your domain in the list.

## Step 7. Publish the site

You do not need to do anything special: `js/firebase-config.js` is part of the site, so merging the pull request (see [DEPLOYMENT.md](DEPLOYMENT.md)) publishes it. To republish after a change, open the **Actions** tab on GitHub, click **Build and deploy** and **Run workflow**.

## How to test that voting works

1. Open the live site on a laptop. Choose **Host the game**, continue, and click **Start game**.
2. **Check:** a room code like `K7M2` appears in the top bar.
3. On a phone (switch off Wi-Fi if you like, to prove it works over mobile data), open the site and choose **Join as audience**. Enter the code.
4. **Check:** the phone shows the current question and "Watching the host's screen".
5. On the laptop click **Ask the Audience**. **Check:** the phone shows four tappable answers with a countdown.
6. Tap an answer on the phone. **Check:** the phone says *Vote recorded* and the host's bar graph rises.

## Common errors and fixes

| What you see | What it means | Fix |
|---|---|---|
| "Playing without audience voting" with *Anonymous sign-in is switched off* (`auth/operation-not-allowed`, `auth/admin-restricted-operation`) | Step 3 is not done | Enable Anonymous sign-in. |
| `auth/unauthorized-domain` in the browser console | The site's address is not in the allowed list | Do Step 6. |
| `auth/invalid-api-key` or `auth/api-key-not-valid` | The values in `js/firebase-config.js` are wrong, or the key has restrictions blocking the site | Re-copy the settings (Step 2). If you restricted the key, make sure `https://rccgkd.github.io/*` is allowed. |
| "The room refused the update" (`PERMISSION_DENIED`) | The rules do not match what the site sends | Re-copy and publish `database.rules.json` (Step 5). Make sure the live site is the redesigned one. |
| "Room not found" on a phone | Wrong code, or the host has not pressed Start game | Re-read the code; zero and the letter O are not used, nor 1 and I. |
| "Could not reach the room" | No internet connection, or a school or office network blocks Google | Try mobile data. |
| Phone stays on "Watching the host's screen" after Ask the Audience | The host used all lifelines or the phone lost connection | Check the phone's connection; reopen the site and re-enter the code. |
| Nothing changes after editing a file | The deployment has not finished | Check the **Actions** tab for a green tick, then refresh. |

## Optional hardening (recommended when you have time)

- **Restrict the API key.** In [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services** > **Credentials**, open the *Browser key*, choose **Websites** under *Application restrictions* and add `https://rccgkd.github.io/*`. This stops other websites from using your key.
- **Firebase App Check.** In the Firebase console open **Build** > **App Check** and register the web app with **reCAPTCHA Enterprise** (or *reCAPTCHA v3*). Start in *Monitor* mode and look at the numbers before choosing *Enforce*, because enforcing without the matching code in the site would block voting. Adding App Check to the site code is a small future change, listed in the recommendations.
- **Know the free limits.** The free Spark plan allows 100 simultaneous connections and 1 GB of stored data. A church-sized audience fits comfortably. More than 100 phones at once would need the paid Blaze plan.
- **Tidy old rooms occasionally.** Each game leaves a tiny record in the database. Under **Realtime Database > Data**, hover over `rooms` and use the **×** to delete old games. Each room records when it was created (`createdAt`).

## Glossary

- **API key**: an identifier that tells Google which project a request belongs to. Not a password.
- **Authorized domain**: a website address allowed to use sign-in for your project.
- **Security rules**: instructions, kept in Firebase, that decide who may read or write data. They are the real protection.
- **Secret**: a value that must stay private, such as a password or a service-account key. Kingdom Quiz needs none.
- **Anonymous sign-in**: a random ID given to a device so it can be told apart, without any account.
- **Realtime Database**: Firebase's live notebook that updates every connected screen instantly.

## What NOT to share or commit

Never put any of these in GitHub, in a chat, or in an issue:

- A **service account key** (a `.json` file with `"private_key"` in it).
- Files whose names contain `adminsdk`.
- Your Google account password or recovery codes.

The `firebaseConfig` values from Step 2 are fine to share. If you ever commit a private key by mistake, delete the key in **Project settings > Service accounts** and ask Google to generate a new one, then tell the repository's maintainers.
