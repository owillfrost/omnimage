# Blind Layout Benchmark Evaluation Report

**Evaluated:** 2026-10-30T03:31:39.058Z | **Total Anchors:** 25

## 1. Global Precision Comparison (Top-10 Precision)

| Method | Description | Precision@10 | Hits / Proposed |
|---|---|:---:|:---:|
| **Layout v2** | Redmean Mass + RGB Multi-Channel Sobel | **10.8%** | 27 / 250 |
| **Layout v1** | Grayscale Luminance Rec. 601 | 14.0% | 35 / 250 |
| **CLIP ViT-B/32** | Semantic Baseline | 29.2% | 73 / 250 |
| **Random** | Chance Floor Baseline | 1.6% | 2 / 125 |

## 2. Pairwise Direct Match: Layout v2 vs Layout v1

- **v2 Won:** 5 (20.0%)
- **Tied:** 12 (48.0%)
- **v1 Won:** 8 (32.0%)

## 3. Breakdown by Difficult Case Category

| Category | Anchors | Layout v2 | Layout v1 | CLIP | Random |
|---|:---:|:---:|:---:|:---:|:---:|
| **Full-bleed Photo** | 5 | **6.0%** | 12.0% | 38.0% | 0.0% |
| **Minimal / Flat Image** | 5 | **6.0%** | 8.0% | 16.0% | 4.0% |
| **Isoluminant Edge** | 5 | **6.0%** | 6.0% | 28.0% | 0.0% |
| **Dense Texture / Clutter** | 5 | **18.0%** | 20.0% | 34.0% | 4.0% |
| **Dark/Light Wireframe Pair** | 5 | **18.0%** | 24.0% | 30.0% | 0.0% |

## 4. Per-Anchor Detail

| Anchor ID | Category | Title | v1 Hits | v2 Hits | Winner |
|---|---|---|:---:|:---:|:---:|
| `MUZM4OI877T05` | Full-bleed Photo / Scene | Imagem | 0 | 0 | ⚪ Tie |
| `MUY8KQQWZ15RQ` | Full-bleed Photo / Scene | Imagem | 0 | 0 | ⚪ Tie |
| `MURCW7GGRR27F` | Full-bleed Photo / Scene | fff2badf-82cc-4bc1-b4c5-93f6e4d31311 | 2 | 2 | ⚪ Tie |
| `MURCW7GFLRK0J` | Full-bleed Photo / Scene | ffc59bbb-9b0c-4893-9faa-98563b298d93 | 1 | 1 | ⚪ Tie |
| `MURCW7GF831HI` | Full-bleed Photo / Scene | ffd7a580-eebe-4d15-af78-3c1e4b32a914 | 3 | 0 | 🔴 v1 |
| `MJHBCWHIGTF46` | Minimal / Flat Asset | Search Projects  Photos, videos, logos, illustrations and brandin | 2 | 0 | 🔴 v1 |
| `MJHBCMC6J4KM6` | Minimal / Flat Asset | Programa De Liderança Projects  Photos, videos, logos, illustrati | 0 | 0 | ⚪ Tie |
| `MJHBCOE1XQ8W5` | Minimal / Flat Asset | Modern and clean responsive website template for App business in | 0 | 0 | ⚪ Tie |
| `MJHBC9FMTP217` | Minimal / Flat Asset | 5 Liberdades Projects  Photos, videos, logos, illustrations and b | 2 | 3 | 🟢 v2 |
| `MJHBCGPJN86M9` | Minimal / Flat Asset | Layka SMM agency 3D icons - jane maximishinaBehance | 0 | 0 | ⚪ Tie |
| `MJHBC2HZRY1BV` | Isoluminant Color Boundaries | Pinterest | 1 | 0 | 🔴 v1 |
| `MJHBCDYJJ2HWW` | Isoluminant Color Boundaries | GIF | 1 | 0 | 🔴 v1 |
| `MJHBDBSFGXPFM` | Isoluminant Color Boundaries | Rolés de Malandro — Identidade visual - Levi HeinBehance | 0 | 1 | 🟢 v2 |
| `MJHBDKH9U06PP` | Isoluminant Color Boundaries | REETIME | 1 | 2 | 🟢 v2 |
| `MJHBE61GPRPSC` | Isoluminant Color Boundaries | Health-Ade Summer 2019 CampaignBehance | 0 | 0 | ⚪ Tie |
| `MJHBCKMW2XLW8` | Dense Texture / Bento Clutter | Recipe Cards - Awwwards | 1 | 2 | 🟢 v2 |
| `MJHBBOU83W1IK` | Dense Texture / Bento Clutter | Profitez des offres imbattables sur les vidéoprojecteurs XGIMI po | 1 | 1 | ⚪ Tie |
| `MV9WCM8NR0B28` | Dense Texture / Bento Clutter | Photo by Ruane Tavares  Design on October 14, 2026. Pode ser uma imagem de revista, pôster, tablet e texto. | 1 | 0 | 🔴 v1 |
| `MTW2Y769AZM6C` | Dense Texture / Bento Clutter | Stefanson brand bento | 6 | 5 | 🔴 v1 |
| `MTKJ4K5G2FQSG` | Dense Texture / Bento Clutter | @euhvdesigner Photo by Hudson  Designer on July 01, 2026. May be an image of poster, tablet, magazine and text. | 1 | 1 | ⚪ Tie |
| `MJHBDGRUOA9BT` | Dark/Light Wireframe Structure | Meme Coin WebsiteBehance | 2 | 1 | 🔴 v1 |
| `MJHBCKURSNMM0` | Dark/Light Wireframe Structure | Aaply page - SaaS Landing Page | 5 | 5 | ⚪ Tie |
| `MJHBIDPNNCF28` | Dark/Light Wireframe Structure | Dynamic Website For Speaker and Entrepreneur Jasmine Star | 0 | 1 | 🟢 v2 |
| `MJHBCLOZLRW5W` | Dark/Light Wireframe Structure | Cartloop on Landbook - get inspired by landing design and more | 5 | 2 | 🔴 v1 |
| `MJHBCLWAKCMRS` | Dark/Light Wireframe Structure | Moya - Webflow HTML website template on Land-book - the best webf | 0 | 0 | ⚪ Tie |
