# Space Apps compliance checklist

Taken from the 2026 Space Apps Participant Terms & Conditions, the Project Submission Guide, the Judging & Awards Guide, the Participant FAQs, and the challenge page with its Resources tab. Check the current pages before submitting, because rules can change.

## What the finished game must have (all checked for Poppy Pants in Space on 2026-11-15)

- [x] **Open source license**: Apache-2.0 in `LICENSE` (GitHub detects it), and the README "License" section.
- [x] **AI use disclosed** (the rules call it "Super Intelligence"):
  - README "Use of AI" section: what the team decided, and what Claude wrote (code, in-game text, procedural audio)
  - a header comment in every JS and CSS file
  - an `<!-- -->` comment and `<meta name="ai-assistance">` in `index.html`
  - "About this game" in the in-game handbook
- [x] **No AI images, no NASA branding**: no logos, insignia or mission patches. All visuals are CSS, SVG, canvas or system emoji.
- [x] **At least one NASA resource used** (required for global awards): see README "NASA data and resources used".
- [x] **References and licenses listed**: fonts (OFL), Firebase SDK (Apache-2.0), Firebase and GitHub services, NASA resources.
- [x] **No implied endorsement**: README has the NASA non-endorsement line. Launcher and part names are made up.
- [x] **Privacy**: anonymous sign-in. The only personal data is a typed nickname (the prompts say "Nickname" with a privacy hint). No analytics, no ads, no tracking.
- [x] **Content**: nothing discriminatory, sexual or commercial, and no likeness of real people or minors. Real-mission facts are short and in our own words.
- [x] **English only.**

## When you add something

- New JS or CSS file → copy the AI header from an existing file.
- New third-party script, font or asset → add it to "References and licenses" with its license. Prefer code-drawn assets.
- New real-world fact → keep it short, in your own words, from public mission pages, and avoid logos.
- Never collect email, age, location or other personal data. Keep co-op anonymous.
- Don't write anything that suggests NASA, JPL or another agency made or approved the game.

## Submission (check the Project Submission Guide for current details)

- Project page with a title, high-level summary, links to the project and repo, and a demo.
- Demo: a video of 30 seconds or less, or up to 7 slides. English.
- List the NASA data and resources used, the use of AI, and the tools and references.
- Team size 1–6.
- Deadline: as given in the guide (local time).
- Judging criteria: Impact, Creativity, Validity, Relevance, Presentation. Show the science-first flow, the real engineering trade-offs and beginner accessibility in the demo.

## Timing

The Participant FAQs say teams should not begin working on challenges before the hackathon. Check the current FAQ and talk to your Local Lead about anything you're unsure of. Don't rewrite git history to hide when work happened.
