# Google Play promo video: the upload note

Google Play does not take a video file. The listing carries a **YouTube link**,
and the video shows on the store page only when the listing also has a feature
graphic (it does: `store-assets/screenshots/android/feature-graphic/android.png`).
Uploading to YouTube is the one step that needs Josh's own account.

## The file

- `preview.mp4` in this folder: 1920x1080 landscape, 30 fps, H.264, under 30 s.
  The framed phone on the signature ground with the caption overlays.
- `preview.poster.png` is the frame at the poster second (for the YouTube thumbnail).

## YouTube upload (Josh, about two minutes)

1. studio.youtube.com, signed in as the Josh Approved channel. Create, Upload videos, pick `preview.mp4`.
2. **Title:** `Workout Timer: Interval HIIT, by Josh Approved`
3. **Description:**

   ```
   A workout interval timer for Tabata, HIIT, climbing, boxing, and any work-and-rest routine. Build a timer once, save it, and run it again with one tap. No paywall. No ads. No tracking. No accounts.

   Google Play: https://play.google.com/store/apps/details?id=com.joshapproved.freeworkouttimer
   App Store: https://apps.apple.com/app/id6767314178
   Open source: https://github.com/Josh-Approved/workout-timer
   ```

4. **Thumbnail:** upload `preview.poster.png`.
5. **Audience:** not made for kids. **Visibility:** **Unlisted** (Play embeds it; it never has to be searchable on YouTube).
6. **Monetization / ads:** leave off. Play rejects a promo video that plays ads, and the studio runs none anyway. Do not enable age restriction either, since an age-gated video will not play on the store page.
7. Copy the link from the Video link box. Either form is fine: `https://youtu.be/<id>` or `https://www.youtube.com/watch?v=<id>`.

## Put the link on the listing (the framework does the pasting)

Add one line to the **Google Play** section of `STORE_LISTING.md` (the factory-hosted copy, symlinked into this repo):

```
- **Promo video:** https://www.youtube.com/watch?v=<id>
```

Then push the listing:

```bash
node scripts/push-play-store.mjs workout-timer --dry-run
node scripts/push-play-store.mjs workout-timer --push
```

`push-play-store.mjs` reads the field, normalizes it to the watch URL, and sets
`video` on the `en-US` listing and every pushed translation. The dry run prints
the planned listing body so the URL can be checked before anything is written.
No console paste is needed.
