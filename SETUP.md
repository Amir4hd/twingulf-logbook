# Twin Gulf Plant Logbook: setup guide (about 30 minutes)

You need: a Google account, a PC with Chrome, and a Wi-Fi network in the factory.
Everything below is free (Firebase "Spark" plan is enough for this factory).

## Part 1: Create the database (Firebase)
1. Go to https://console.firebase.google.com and click **Create a project**. Name it `twingulf-logbook`. Turn Google Analytics off.
2. Left menu, **Build > Firestore Database > Create database**. Choose **Production mode**. Pick the region closest to you (for example `europe-west` or `me-central`). 
3. Left menu, **Build > Authentication > Get started > Email/Password > Enable > Save**.
4. **Authentication > Users > Add user**. Create these accounts (the email can be made up, for example `admin@twingulf.local`):
   - one for you (the admin)
   - one per tablet, for example `macaroni@twingulf.local`, `lab@twingulf.local`, `packaging@twingulf.local`, `ro@twingulf.local`, `boiler@twingulf.local`
   Use a strong password for each. Click each user and copy its **User UID**; you need your own UID in the next step.
5. **Firestore Database > Start collection**. Collection ID: `admins`. Document ID: paste YOUR admin UID. Add one field `ok` = `true` (boolean). Save. (Only the person with a document here is the admin. Tablet accounts must not be listed.)
6. Firestore **Rules** tab: delete everything, paste the contents of `firestore.rules` from this folder, click **Publish**.
7. Project settings (gear icon) > **Your apps** > click the web icon `</>` > register app `logbook` > copy the `firebaseConfig` values.
8. Open `firebase-config.js` in this folder with Notepad. Paste the values over the PASTE-... parts. Save.

## Part 2: Put the app online (one of these)
**Easiest: Netlify Drop**
1. Go to https://app.netlify.com/drop and drag this whole folder onto the page.
2. You get an address like `https://something.netlify.app`. That is your app address.
3. In Firebase, **Authentication > Settings > Authorized domains > Add domain**, add that address (without https://).

**Or Firebase Hosting** (needs Node.js): `npm i -g firebase-tools`, `firebase login`, `firebase init hosting` (public folder `.`, do not overwrite index.html), `firebase deploy`.

## Part 3: Install on each tablet (Android)
1. Open Chrome on the tablet, go to your app address, sign in with that tablet's account (needs internet this one time).
2. Chrome menu (three dots) > **Install app** (or **Add to Home screen**). An app icon appears.
3. Open the app once while online and let the home screen load. After this it opens even with no internet.
4. Set the tablet date and time to automatic, and the time zone to Nairobi. The 20-minute rules use the tablet clock.
5. Settings > Display > Screen timeout: longer. Turn on Screen pinning if you want to lock the tablet to the app.

## Part 4: First use as admin (on your PC)
1. Open the address in Chrome and sign in with your admin account. You will see **Control room**.
2. **Setup > Operators**: add each operator with a password, and tick **Leader** for shift leaders.
3. **Setup**: check the readings, units and limits for each area.

## Offline behaviour
- With no internet, operators can still open the app and save. Entries are kept on the tablet and sent automatically when the network returns. The top bar shows Offline.
- Do not clear Chrome's data or uninstall the app while entries are waiting to be sent.
- The admin PC needs internet to see the latest data.

## Getting a real .apk (optional)
Go to https://www.pwabuilder.com, enter your app address, choose **Android**, and download the package. It wraps this same app. Installing the PWA from Chrome is simpler and works the same.

## Signing out
Every screen has a small **Sign out** button at the bottom-left. It asks to confirm and needs internet. Backup way: open the app address followed by `?signout`.

## Honest limits
- Operator passwords (inside the app) show who saved an entry. They are not strong security. The Firebase accounts are the real access control.
- Firebase free plan limits: 1 GB storage, 50,000 reads and 20,000 writes per day. This factory should stay far below that.
- The first sign-in on each tablet needs internet.
