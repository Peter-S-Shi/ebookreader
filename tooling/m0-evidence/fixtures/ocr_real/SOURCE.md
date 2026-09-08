# Provenance: real degraded / multi-column / CJK document page fixtures

Both images are pages from a public-domain 1893 book, digitized by Google
and hosted by the Internet Archive - genuine period print (not a synthetic
render), genuinely degraded by 130+ years of scan/print artifacts, and
freely redistributable.

- **Work:** *The Chinese Classics, with a Translation, Critical and
  Exegetical Notes, Prolegomena, and Copious Indexes* by James Legge, 2nd
  ed., 1893. Public domain (published 1893, author died 1897).
- **IA identifier:** `bub_gb_5MFFENe7xPEC`
- **Retrieved:** 2026-09-08

| File | Source page | URL used | SHA-256 |
|---|---|---|---|
| `ia_100.jpg` | leaf/page index 100 (English commentary, two-column layout) | `https://archive.org/download/bub_gb_5MFFENe7xPEC/page/n100_w1000.jpg` | `0cf05ff08dc14581f7f6edfbd7f3378c82ab33e6268e28213f811ee0cbdadd29` |
| `ia_200.jpg` | leaf/page index 200 (real page 603, "Duke Ch'aou") - vertical multi-column classical Chinese text at top, English translation below | `https://archive.org/download/bub_gb_5MFFENe7xPEC/page/n200_w1000.jpg` | `75bdd72b5db22fecf3013303d2b70c5584c5203f3d0046e2b8d37ba9dd1418da` |

`ia_200.jpg` is the primary "real degraded, multi-column, CJK document page"
fixture required by the M0 corrective pass: it contains genuine vertical
classical-Chinese columns (right-to-left reading order) above a horizontal
English translation and a two-column English commentary block, on a page
with real period-print degradation (uneven ink, scan noise, slight skew).

`ia_100.jpg` is a secondary real multi-column (English) fixture, used to
show the same column-reading-order risk exists independent of script.

To re-fetch (values above are the pinned hashes for reproducibility):

```bash
curl -sL -o ia_100.jpg "https://archive.org/download/bub_gb_5MFFENe7xPEC/page/n100_w1000.jpg"
curl -sL -o ia_200.jpg "https://archive.org/download/bub_gb_5MFFENe7xPEC/page/n200_w1000.jpg"
sha256sum ia_100.jpg ia_200.jpg   # compare against the table above
```
