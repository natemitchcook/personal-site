# natemitchcook.com

Nate Cook's personal website. The homepage at [natemitchcook.com](https://natemitchcook.com) is a minimal résumé and work portfolio. Its source remains the self-contained root `index.html` with inline CSS and no build step.

The separate [travel card guide](https://natemitchcook.com/cards) compares welcome offers and annual benefits, includes a personal credit-use calculator, and explains how to find award flights with Seats.aero. Card application and Seats.aero buttons use Nate's referral links where available, with disclosure on the page. This section lives in `cards-app/`, uses React and shadcn components, and builds to a static `cards/` folder.

## Local development

```sh
cd cards-app
npm ci
npm run build
cd ..
python3 -m http.server 8000
```

Open `http://localhost:8000/` for the résumé and `http://localhost:8000/cards/` for the card guide. The `/cards` URL without a trailing slash is an S3 object created by the deployment workflow; the local file server may redirect to `/cards/`.

Card content and referral destinations are in `cards-app/src/data/cards.json`. The page is in `cards-app/src/page.tsx`; shared styling is in `cards-app/src/globals.css`. Recheck issuer terms before updating dated offers or benefit amounts.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`. It builds the cards app, assumes the existing AWS deploy role via GitHub OIDC, syncs the homepage and generated cards assets to the `natemitchcook.com` S3 bucket, uploads the cards HTML to the exact S3 key `cards`, and invalidates CloudFront distribution `EKTOMPVYYAD6U`.

The extra `cards` object is necessary because CloudFront's S3 origin requests an exact key for `/cards`; its root index setting does not automatically resolve subdirectories. The homepage file is deployed as before. See [DEPLOY.md](DEPLOY.md) for manual deployment details.
