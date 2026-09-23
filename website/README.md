# calcamp.vercel.app

The marketing page for CalCamp. Plain HTML and CSS: no framework, no build step, no
dependencies. `vercel.json` at the repository root points Vercel's output directory here.

It replaced the app's own web export, which used to be served at this domain and dropped
visitors onto a sign-in screen for a product they could not yet have.

## Working on it

```bash
cd website && python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173>. There is nothing to compile; a refresh is the whole loop.

## Two things to keep true

**The palette is copied from the app.** `styles.css` carries the dark-mode values from
`src/theme/palette.ts`, so the interface panels are the colours CalCamp actually renders. If
the app's palette changes, change it here as well — a page showing a product that no longer
looks like that is worse than a page with no pictures.

**Every screen is authored at 393×852 and scaled down as a whole**, via `--device-w`,
`--device-h` and `--shrink`. That is the only thing keeping the previews in proportion: a 17px
font inside them is the 17px a phone really renders. The first version guessed "phone-ish"
pixel values inside a 260px box and everything came out looking like a blown-up toy. Add screen
content at real iOS sizes and let the transform do the shrinking — never size things to the
box on the page.

**The panels are previews, not screenshots.** They are built in HTML from the app's real design
system and real wording, and the footer says so. That is a fair way to show an unreleased app;
presenting them as captured screenshots would not be. When there are real screenshots, swap them
in and drop the disclaimer.

## While it is unreleased

Nothing on the page offers a download, and the "Coming soon to the App Store" element is
deliberately not a button — a control that looks pressable and is not spends trust for nothing.
When the app ships, that element becomes a real App Store link and the TestFlight line goes.
