# Portseido visual audit

Observed on 20 November 2026 in the logged-in Chrome session. Desktop was 1080 CSS px wide and mobile was emulated at 390 × 844 CSS px. Values below describe the observed dark theme. Use the screenshots as audit evidence for a visually distinct tracker.

| Element | Measured appearance |
| --- | --- |
| Header and background | Header `#0e1015`. Near-black report canvas. |
| Desktop sidebar | `#1e222b`. Roughly 56 px collapsed and 215 px expanded. Muted icon and label treatment. |
| Text | White main text, `#eef0f5` selected text, `#aeb4c2` secondary navigation text, and `#79808f` subdued control labels. |
| Typography | Geist Mono Numerals and Geist Variable with system fallbacks. Sidebar group labels use Geist Mono Variable at 11 px and weight 600. Transactions heading is 20 px, weight 400, with a 32 px line box. |
| Primary action | Purple `#7c4dff` fill, white 14 px semibold label, 36 px height, 10 px radius on Add Transaction. |
| Segmented controls | 28 px pill buttons. Active fill `#313845`, 13 px semibold text. Inactive buttons are transparent with muted 13 px medium-weight labels. |
| Icon controls | Header controls are circular, 40 px high. Inline transaction icons are 28 px high with 8 px corners. Trial avatar has a `#2a2150` fill. |
| Tables | 40 px desktop header at 14 px. Fine row dividers, compact numeric columns, small icon actions and pagination. Mobile Transactions uses stacked cards with labels beside numeric values. |
| Cards and badges | Rounded charcoal portfolio cards and warm dark benchmark cards. Positive changes are green and negative changes red. Period tags are small, muted uppercase labels. Trial banner groups a gradient, white countdown tiles and a white CTA. |

Desktop Overview uses a large account total and a neighboring benchmark summary above the chart. Portfolio and benchmark cards precede Holdings farther down the page. Mobile stacks the summary and chart beneath the account strip, uses narrow side gutters, and adds a fixed six-icon bottom bar. The selected destination uses a purple tint.

## Chart styling

The observed Overview Value chart uses a white Portfolio line, gray benchmark line (`#868686`), and dark gray (`#4b4b4b`) Cash Deposits area series. The Highcharts SVG background is transparent. Inline series keys appear above the plot. Desktop also has muted date ticks, an interval picker, date endpoints, and a blue-gray navigator with draggable handles. The Holdings gain chart uses red bars for negative values and a visible zero line. Performance historical return uses columns and subtle horizontal rules, including `#292e39` grid strokes.

## Screenshots

| View | Desktop | Mobile |
| --- | --- | --- |
| Overview | [Desktop](audit-screenshots/desktop-overview.jpg) | [Mobile](audit-screenshots/mobile-overview.jpg) |
| Holdings | [Desktop](audit-screenshots/desktop-holdings.jpg) | [Mobile](audit-screenshots/mobile-holdings.jpg) |
| Allocation | [Desktop](audit-screenshots/desktop-allocation.jpg) | [Mobile](audit-screenshots/mobile-allocation.jpg) |
| Performance | [Desktop](audit-screenshots/desktop-performance.jpg) | [Mobile](audit-screenshots/mobile-performance.jpg) |
| Transactions | [Desktop](audit-screenshots/desktop-transactions.jpg) | [Mobile](audit-screenshots/mobile-transactions.jpg) |
