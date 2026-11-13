# Konnected House Design Studio

The team's carousel and reel cover studio for **Konnected Minds (KMP)** and **Unbroken Podcast**.
Static site plus Firebase (Auth for logins, Firestore for posts and photos). No build step.

```
public/            the site (Vercel and Firebase Hosting both serve this folder)
  index.html       sign in, studio picker, two-week schedule
  kmp/  unbroken/  the studios (generated, see below)
  team/            admins add people and set roles
  js/kh.js         Firebase setup, roles, photo store
  js/studio.js     connects a studio page to Firebase
  css/studio-theme.css  the studio interface theme (glass, navy/blue for KMP, black/red for Unbroken).
                   Interface only: slides are drawn on canvas with their own colours and never read it.
studios/           studio sources, the same files the claude.ai artifacts are built from
tools/port.py      turns studios/*.src.html into public/*/index.html
tools/kh-admin.mjs admin tasks (rules, members, importing posts and photos)
firestore.rules    who can do what
```

## Roles

| Role | Can do |
| --- | --- |
| Admin | Everything, plus the Team page |
| Designer | Edit and download carousels and reel covers |
| Social media manager | Edit and download reel covers; download carousels; mark posts as posted |
| Contributor | Edit reel covers (titles and hooks) |
| Viewer | See everything and download |

Everyone, viewers included, can comment on designs (Comments tab in each studio). Comments live in
`studios/{studio}/comments`, can be pinned to a slide, and show as count badges on posts and slides
and under **Open comments** on Home.

Everyone has their own email login. Posts belong to the studio, so anyone with the right role
can carry on a post a teammate started. The rules in `firestore.rules` enforce this; the buttons
in the site just follow them.

## Changing a studio

Edit the source (`KM Studio Source/studio.src.html`, or regenerate Unbroken with
`patch_from_km.py`), copy it to `studios/kmp.src.html` / `studios/unbroken.src.html`, then:

```bash
python3 tools/port.py
```

## Admin tasks

Needs the service-account key at `../.secrets/firebase-admin.json` (or `KH_SA_KEY=path`).
**Never commit that file.**

```bash
cd tools && npm install
node kh-admin.mjs rules                          # deploy firestore.rules
node kh-admin.mjs member someone@x.com designer Ama
node kh-admin.mjs import kmp posts.json photos/  # photos named <id>.jpg keep their id
node kh-admin.mjs pull kmp backup.json
```

## Photos

Photos are stored in Firestore in 900 KB chunks, so the site runs on Firebase's free Spark plan
without Cloud Storage. Photos over 2.5 MB are re-encoded to 2700 px JPEG on upload. Each browser
caches a photo after its first load. The free plan allows 1 GiB of Firestore data (roughly
1,500 to 3,000 photos); move photos to Cloud Storage before that fills up.

## Deploying

- **Testing:** import this repo in Vercel (framework "Other", no build command; `vercel.json`
  points it at `public/`).
- **Live:** Firebase Hosting (free): `npx firebase-tools deploy --only hosting`, then add the
  custom subdomain in the Firebase console and give the developer the DNS records it shows.
- Add each new domain under Firebase → Authentication → Settings → Authorized domains.
