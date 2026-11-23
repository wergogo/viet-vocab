# Viet Vocab

A Vietnamese vocabulary app for learners who care about Hán characters. Save a word with its meanings, IPA, etymology and the Hán character behind each syllable, filled in from English Wiktionary; find every saved word that shares a character; and review them with spaced repetition. It installs on a phone, works offline, and can sync between devices through a file in your own private GitHub repository.

**Open it:** <https://wergogo.github.io/viet-vocab/>

## Install it

- **Android:** open the address in Chrome, then choose **Install app** (or **Add to Home screen**) from the menu.
- **Computer:** Chrome and Edge show an install button in the address bar.

## Your data

- Your words stay in the browser you use, in its site storage. There is no server: anyone can use the app, and each person's words stay with them.
- **Settings → Data** exports a backup as JSON, and imports one.
- Sync is optional. It copies your words between your devices through one file, `vocab.json`, in a private GitHub repository you own.

## Set up sync

1. Create a private repository, adding a README so it has a `main` branch: <https://github.com/new?name=viet-vocab-data&visibility=private>.
2. Create a fine-grained token for that repository only, with **Contents: Read and write**: <https://github.com/settings/personal-access-tokens/new?name=Viet+Vocab+sync&description=Sync+for+the+Viet+Vocab+app&expires_in=366&contents=write>. Keep it in your password manager.
3. On each device, open **Settings → Sync**, fill in your GitHub user name, the repository, `main`, `vocab.json` and the token, then **Test connection** and **Save**.

The token stays in that browser and is sent only to GitHub. Every GitHub Pages site of the account that hosts the app shares the app's storage, the token included, so host the app only beside sites you trust.

## Development

Needs Node.js 24.

    npm ci
    npm run dev      # the app on http://localhost:5173
    npm test         # unit tests (Vitest)
    npm run check    # type-check (svelte-check)
    npm run build    # production build in dist/

To try sync without GitHub, run `npm run fake-github` and `npm run dev:fake-sync`: the app on http://localhost:5174 then syncs with a local stand-in for GitHub's API.

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Credits

- Dictionary content from [Wiktionary](https://en.wiktionary.org/), under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the test fixtures in `tests/fixtures/wiktionary/` too.
- Simplified/traditional character data from [OpenCC](https://github.com/BYVoid/OpenCC) (Apache-2.0).
- Built with Svelte, Vite, vite-plugin-pwa, Workbox and ts-fsrs (MIT), and Dexie (Apache-2.0).
- Dexie.js: Copyright (c) 2014-2017 David Fahlander.
- The icon's 越 is drawn in Noto Serif SC (SIL Open Font License 1.1).

## License

The app's code is MIT-licensed; see [LICENSE](LICENSE). Two parts are other people's data, under their own licences: `src/lib/text/st-table.json` is generated from OpenCC (Apache-2.0), and the Wiktionary responses in `tests/fixtures/wiktionary/` are CC BY-SA 4.0.
