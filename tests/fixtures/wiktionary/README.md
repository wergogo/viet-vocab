# Wiktionary test fixtures

Raw responses from the English Wiktionary action API, fetched on 2026-11-21 with [`scripts/fetch-wiktionary-fixtures.mjs`](../../../scripts/fetch-wiktionary-fixtures.mjs). The script makes the same requests the app makes (`format=json&formatversion=2&origin=*`, header `Api-User-Agent: VietVocab/1.0`), so the parser tests run against real markup.

The content comes from Wiktionary and is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Authors are listed in each page's history on en.wiktionary.org.

| File | Request | Why it's here |
|---|---|---|
| `nhap-khau.json` | parse `nhập khẩu` (wikitext + text) | whole-word `vi-etym-sino`, one part of speech |
| `quoc-gia.json` | parse `quốc gia` | two parts of speech, labels, two audio files |
| `kinh-te.json` | parse `kinh tế` | classifier `cls=nền` |
| `hanh-phuc.json` | parse `hạnh phúc` | whole-word gloss, `head=` on the headword |
| `thanh-pho.json` | parse `thành phố` | per-character glosses, audio |
| `dien-thoai.json` | parse `điện thoại` | linked glosses, linked classifier |
| `hoc-sinh.json` | parse `học sinh` | per-character glosses, labels |
| `bac-si.json` | parse `bác sĩ` | nested templates in glosses, `suffix=`, IPA variants |
| `nhap.json` | parse `nhập` | one syllable, examples under definitions |
| `tieng-viet.json` | parse `tiếng Việt` | characters only in the headword (chữ Nôm) |
| `dong.json` | parse `đồng` | other languages first, shared pronunciation, four etymologies, a Romanization-only entry |
| `nuoc.json` | parse `nước` | Nôm characters in wikilinked headwords, with alternatives |
| `ha-noi.json` | parse `Hà Nội` | a proper noun, for lookups typed in lowercase |
| `van-hoa-stub.json` | parse `văn hóa` | alternative-spelling stub |
| `van-hoa.json` | parse `văn hoá` | the stub's main entry |
| `missing-page.json` | parse `xyzkhongcotu` | `missingtitle` error |
| `query-variants.json` | query titles `xyzkhongcotu\|văn hoá` | which spelling exists |
| `char-nhap.json` | parse `入` (wikitext only) | character readings, meanings, compounds |
| `char-quoc.json` | parse `國` (wikitext only) | a meaning inside `{{vi-Han form of}}`; 80 compounds, some without Han |
| `char-hoc.json` | parse `學` (wikitext only) | `vi-l-lite` compounds and slash-joined spellings |
| `ipa-sentence.json` | expandtemplates `{{vi-IPA\|tôi đang học từ vựng mới}}` | IPA for text with no entry |

Wiktionary pages change. To refresh, run `node scripts/fetch-wiktionary-fixtures.mjs --force`, then update the parser tests' expected values where the content changed.
