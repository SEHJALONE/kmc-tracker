# Updating the live Apps Script (about 15 minutes)

**Why.** The live script ("Password masterdata") is the version from 3 Aug. The
website has moved on, so every admin action (list, approve, deny, create user)
is answered with `unauthorized`, no email can be sent, and each attempt to send
one adds a blank row to the Travel Card `submissions` tab. This update fixes all
of that, plus the 28 Sep consumables and the 29 Sep "save downtime again" fix
that were never deployed.

**Checked before writing this.** The live code is identical, character for
character, to the repo's `Code.gs` from 3 Aug (`e05ca21`), so replacing it loses
nothing. The only live function the new file does not carry is the test helper
`testSaveCatalog`.

**What people will notice.** Everyone is asked to sign in once more (the new
script issues signed sessions). Access requests now tell the applicant when a
username is taken or a request is already waiting.

**Emails this turns on (Oct 2026).** Administrators are emailed about each new
access request and the applicant is emailed when it is approved — both by the
script itself. A filed Travel Card emails its submitter a confirmation with the
station report and full bus report attached, and emails its approvers
(supervisors of that station, managers of that line). Start/End tasks that are
left open get a reminder at the expected end of the station time and every 6
hours after. **People only get these if their account has an email address**
(User Management).

**Until this is deployed** the site does not send any email or Start/End task
to the script (it checks first), so the old script can no longer turn them into
blank Travel Card rows. Start/End tasks still work, saved on each device.

You need two files from this folder, open them in Notepad or VS Code:

- `Code-with-email.gs`  → becomes the whole of `Code.gs`
- `Mail.gs`             → becomes a new file named `Mail`

---

## Steps

**1. Check where you are (optional).** In a terminal in the repo:
`node scripts/check-apps-script.mjs`. Today it should say *"still the OLD script"*.

**2. Make a backup copy.** Open the project at
`script.google.com` → *Password masterdata*. Click the **ⓘ Overview** icon on the
left → the three dots top right → **Make a copy**. Name it
`Password masterdata – backup before update`. (This is your way back.)

**3. Replace `Code.gs`.** In the editor open **Code.gs**, click in the code,
press **Ctrl+A**, then paste the whole of `Code-with-email.gs` over it
(**Ctrl+V**) and **Save** (Ctrl+S). Do not merge: replace everything.

**4. Replace the mail file.** If the project already has a file called `Mail`, open it, note its `MAIL_FROM` and `ADMIN_NOTIFICATION_EMAILS` lines, then **Ctrl+A** and paste the whole of `Mail.gs` over it (never keep two mail files: the settings would be declared twice and the script would stop). Only if there is no such file: next to **Files** click **+ → Script**, name it
`Mail`, and paste the whole of `Mail.gs`. Save. Near the top check these two
lines are right for you (they are what the file ships with):

```
const MAIL_FROM = "kmcproductiondept@gmail.com";
const ADMIN_NOTIFICATION_EMAILS = "kmcproductiondept@gmail.com, xcellencysehj@gmail.com";
```

`ADMIN_NOTIFICATION_EMAILS` is who is told about a new access request (every
`systemadmin` account with an email is added automatically). It is also who
reviews a Travel Card when no supervisor or manager is assigned to it.

**5. Authorise it.** In the function drop-down (next to *Debug*) choose
**`checkSender`** → **Run**. Google asks for permission to send email and to
connect to an external service: *Review permissions* → pick the account that
owns the script → *Advanced* → *Go to … (unsafe)* → **Allow**. Open
**Execution log**: it names the mailbox mail will come from and how many emails
are left today. (If you want mail to show as `kmcproductiondept@gmail.com`, add
it under Gmail → Settings → Accounts → *Send mail as*; until then mail comes
from the script owner and nothing breaks.)

**6. Create the sign-in accounts (once).** Choose **`seedBuiltInAccounts`** →
**Run**. It creates the built-in logins (`systemadmin`, `kmcadmin`, `kmc`,
`kmc.super`, `kmc.parts`, `kmc.process`, `kmc.quality`, `kmc.prod`, `dpn.kmc`,
`kmc.cee`) with **new random passwords** and prints each one **once** in the
Execution log. Copy them into your password manager now. Usernames that already
exist are skipped, so it is safe to run again.

**6b. Turn on open-task reminders (once).** Choose
**`installTravelTaskReminderTrigger`** → **Run** (accept the permission prompt
if asked). It checks open Start/End tasks every 15 minutes.

**7. Deploy.** **Deploy → Manage deployments** → the pencil on the active
deployment → **Version: New version** → **Deploy**. The web-app address does
not change, so the site needs no setting.

**8. Check it.** `node scripts/check-apps-script.mjs` should now report *"This is
the NEW script"* and four OK lines. Then, on the site, sign in as an
administrator, open **Access Requests** and look for the pending request.

**9. Switch off the old shared admin token.** Only after step 8 works (an admin
can sign in and open Access Requests): choose **`disableLegacyToken`** → **Run**.
From then on the token that was published in the repo opens nothing.

**10. Clean the blank Travel Card rows.** In the tracker sheet's `submissions`
tab, rows **8, 53–56, 61–64 and 97–99** are blank (no timestamp, VIN or station)
and are the leftovers of the email calls. Also delete any row with VIN
**`KMC-TEST-001`** (station C01-02, project 45 Bus Project, 16 Oct 2026, about
15:18–15:19): those are test rows from developing the Start/End feature, filed by
the old script the same way. Check each is empty, then delete them,
**starting from the bottom** so the row numbers above do not move. No
`activities` or `operators` rows point at them.

## Optional, from the email handover

- `setScheduledReportRecipients("a@x.com, b@x.com")`, then `installDailyReportTrigger()` for the 07:00 report.
- Revoke the old leaked Gmail App Password: myaccount.google.com/apppasswords.

## If something goes wrong

- **Sign-in stops working for everyone:** re-run `seedBuiltInAccounts` (it only
  adds missing accounts) and read the Execution log for the passwords; or go back
  (below).
- **Go back:** *Deploy → Manage deployments →* pencil → pick the **previous
  version** → Deploy. Or copy `Code.gs` from the backup project you made in step 2.
- **"Authorization required" after deploying:** run `checkSender` again (step 5)
  and redeploy.
