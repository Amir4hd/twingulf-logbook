# Twin Gulf Logbook: server-enforced access (step by step)

Nothing here changes the live app until you do the step. Every step can be undone. Do them in order and stop at any point.

## Step 0: checks in Firebase Console (15 minutes, nothing breaks)
1. Authentication > Settings > User actions: turn OFF "Enable create (sign-up)" (if the option exists). Strangers must not be able to register.
2. Authentication > Users: look at the list. Delete any account you do not recognise. Take a screenshot (hide nothing needed) and send it to Claude.
3. Do NOT restrict the web key to your site address. The key is public by design, the rules are what protect the data, and a website restriction would stop the Cloudflare server functions from working.
4. Firestore > Rules: click the **History** button and copy your CURRENT live rules into Notepad (backup). Send them to Claude too, so the new rules can be compared.

## Step 1: new rules, lock still OFF (10 minutes)
1. Firestore > Data > Start collection `security` > Document ID `mode` > field `enforce` (boolean) = `false` > Save.
2. Firestore > Rules: paste the contents of `firestore.rules` (this folder) > Publish.
   Result: the app works exactly as before (the lock is off). Any collection that the old rules allowed and the new file forgot would show a "not allowed to save" message: tell Claude at once, or press Rules > History > restore the old one.
3. Cloudflare Pages: nothing to do for this step.

## Step 2: push the new app (Claude does it when you say "push")
- Adds Control room > Access, the "Waiting for admin approval" screen, and the server function `/api/accounts`.
- The function uses the same FIREBASE_SERVICE_ACCOUNT secret as the password page. If that page already works, this works too.
- Check: open the app as admin > Access > "Check sign-in accounts".

## Step 3: approve everybody who works today
1. Access > "Approve all current accounts". Every existing sign-in becomes Approved.
2. Check the list. Remove or Block accounts you do not know.

## Step 4: pilot, then switch the lock ON
1. Create one test tablet account: Access > Add a tablet (e.g. press9). Sign in with it on one device.
2. Switch the lock ON (Access > Turn the lock on). Test: the approved tablet keeps working. Block the test account: it stops within seconds. Approve it again: it works again.
3. If anything is wrong: Access > Turn the lock off (or set `security/mode.enforce` = false in Firebase). Everything returns to normal at once.

## Step 5: one account per tablet (do slowly, one tablet per day)
Create press1, press2, lab1... with Access > Add. On each tablet: Sign out, sign in with its own account. From then on each tablet can be blocked on its own.

## Later (optional)
- Cloudflare Access for people outside the factory (email code). Not needed for the tablets and not part of the first rollout, because a wrong rule there can lock the tablets out.
- Tighter rules per role, and moving operator password codes so tablets cannot read them.

## Cost
All free: Firebase free plan, Cloudflare Pages and Functions. The lock adds about 3 small record reads per saved reading or list opening. Check Firestore > Usage after a week (free limit 50,000 reads a day).
