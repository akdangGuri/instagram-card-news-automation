# card.92pong.com deployment

## Target domain

Use:

```text
https://card.92pong.com
```

## Required production environment variables

```text
PUBLIC_BASE_URL=https://card.92pong.com
GRAPH_VERSION=v23.0

FB_APP_ID=875028168403415
FB_APP_SECRET=...
FB_REDIRECT_URI=https://card.92pong.com/api/facebook/oauth/callback

IG_APP_ID=3910660875907483
IG_APP_SECRET=...

THREADS_APP_ID=...
THREADS_APP_SECRET=...

TOUR_API_KEY=...
IG_USER_ID=...
IG_ACCESS_TOKEN=...
THREADS_USER_ID=...
THREADS_ACCESS_TOKEN=...
FB_PAGE_ID=...
FB_PAGE_ACCESS_TOKEN=...
```

## hosting.kr DNS

After the hosting platform gives a CNAME target, create:

```text
Type: CNAME
Name: card
Value: <deployment CNAME target>
```

## Meta settings

Set:

```text
App domain:
card.92pong.com

Facebook valid OAuth redirect URI:
https://card.92pong.com/api/facebook/oauth/callback

Instagram redirect URI:
https://card.92pong.com/api/instagram/oauth/callback

Threads redirect URI:
https://card.92pong.com/api/threads/oauth/callback

Privacy policy URL:
https://card.92pong.com/privacy.html

Terms URL:
https://card.92pong.com/terms.html

Data deletion URL:
https://card.92pong.com/data-deletion.html
```
