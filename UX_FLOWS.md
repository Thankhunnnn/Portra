# Portseido UX audit

Observed on 20 November 2026 in Chrome. Ten screenshots cover desktop and 390 px mobile. The audit opened views, menus and dialogs using the existing portfolio. No portfolio data was submitted, edited, saved, or deleted.

## Navigation and shared controls

| Surface | Controls and behavior |
| --- | --- |
| Desktop rail | Logo and Home lead to `/portfolio`. Main links are Performance, Allocation, Dividends and Risk. Tools groups Goal Tracker, Trade Analysis and Rebalance. Manage groups Transactions, Custom Assets and Settings. Help has its own menu. The rail can expand from its icon-only state. |
| Top bar | Add icon, price refresh, Help icon, and Account avatar. Account opens a menu with Appearance, Manage Subscription, Portfolio Settings and Log out among the observed entries. |
| Mobile bar | Fixed icon strip in this order: Home, Performance, Allocation, Dividends, Transactions, hamburger. Hamburger navigates to `/menu`, where account preferences and an All reports list are available. The account avatar remains in the upper-left, with Add, Refresh and Help at upper-right. |
| Portfolio strip | All and individual account selectors. The funnel beside All opens a portfolio selection panel with Select All and Apply. The ellipsis opens Create Portfolio and Portfolio Settings. The combined portfolio displays its configured currency. |
| Settings | `/menu` includes Portfolio Settings, Subscription, Language & Numbers, Calculation Methods, Appearance, report links, Privacy and Log out. Portfolio Settings opens a dialog listing All and individual portfolios with configured currency, benchmark and transaction source where applicable. |
| Currency and benchmarks | All → overflow → Edit Settings opens Change portfolio settings. It has Currency, Primary Benchmark and Secondary Benchmarks comboboxes, removable secondary benchmark chips, a help link, Cancel and Save. Primary Benchmark drives the main comparison and secondary benchmarks appear in nearby summary cards. Cancel was tested. |
| Trial banner | Visible CTA and dismiss icon. Both were left untouched. |

## Overview and Holdings

- **Overview summary** has a visibility icon, current portfolio value, Today, Yesterday, selected-period change, last-updated timestamp and the period selector. The shared period menu on Performance exposed 1W, 1M, 3M, 6M, YTD, 1Y, 5Y and ALL.
- **Overview desktop summary tabs** are Benchmark, Key Stats, P&L Breakdown and Gains & Returns. Benchmark shows hypothetical investing and cash comparisons, each with a More info control. The mobile Overview snapshot omitted those summary tabs.
- **Overview chart** offers Value, Return, Gain, Cash and %Off High; MWR, TWR and SR; More info; Share performance; start and end date controls; zoom presets 1m, 3m, 6m, Ytd, 1y, 3y, 5y and All. Longer presets can be disabled with insufficient history. The legend presents Portfolio, the primary benchmark and Cash Deposits. Point inspection in Value mode displayed the full weekday and date, followed by **Cash Deposits**, **S&P500** and **Portfolio**, each with a comma-formatted number. The benchmark label follows the selected benchmark. Legend toggling and other chart modes' tooltip fields were unverified.
- **Cards** are grouped into Portfolios and Benchmarks. The Benchmark heading has a pencil icon.
- **My Holdings** is an in-page section on Home. Its visualization controls offer Ticker, Sector, Industry, Country and Assets Type; Gain (Value), Gain (%) and Price (%); 1d, 1w, 1m, 3m, 6m, Ytd, 1y and All; and two icon-only visualization layouts.
- **Holdings table** provides Overview, Cost, Gain and Price presets, Search Ticker, two adjacent icon buttons, Rebalance and Share holdings. The observed header labels were Ticker, Allocation, Last, Avg Cost, 1D Gain %, Unr. Gain %, 1D Gain, Unr. Gain, Market Value and Shares. Ticker has an additional icon, rows have trailing actions, and the footer includes Items per page and first/previous/next/last navigation. Individual column sort behavior and unlabeled action menus were unverified.
- **Ticker drill-down** opens a dialog over the current page. The tested ticker showed symbol, company name, Add Transaction, Close, Price and %Off High, Event Flag, chart zoom, Lots, Win Rate, Win Rate vs benchmark, Total Trade Gain and a lot table. Its visible columns included Ticker, Side, Open Date, Price, Ccy, Shares, Cost Basis, Total Gain, Total Return, Alpha and Holding Days. Closed using the header icon after dismissing its Add Transaction dialog.

## Allocation

Allocation exposes Share, Market Value, Cost, Gain and Loss. Grouping controls are Sector, Industry, Country, Region, Market and Assets Type. Summary fields are Portfolio Value, Number of holdings, Cash on hand and Cash (% of portfolio). The holdings table below shares the presets, search, Rebalance, Share holdings and pagination affordances described above. Chart drill-down and tooltip content were unverified.

## Performance

- The upper summary shares the period selector and Benchmark, Key Stats, P&L Breakdown and Gains & Returns tabs.
- **Total Return vs Benchmarks** exposes Total Return, MWR/TWR/SR, More info and Share. The comparison table includes Benchmark, 1 M, 3 M, 6 M, YTD, 1 Yr, 2 Yr, 5 Yr, All and Annualized.
- **Historical Return** exposes Monthly, Quarterly and Annually, MWR/TWR/SR, Return/Balance, More info, Share and an unlabeled checkbox. The table includes Period, My Portfolio, the benchmark, and vs benchmark. Exact historical chart hover fields and the unlabeled checkbox behavior were unverified.

## Transactions

| Control | Observed behavior |
| --- | --- |
| My Input / Adjusted | Two presentation tabs, with My Input initially active and a neighboring help icon. |
| Search and funnel | Free-text Search. Clicking the funnel opened inline filters for Portfolio, Date from, Date to, Action, Ticker and Currency. Both date inputs show `yyyy-mm-dd`. Clicking the funnel again closed the panel. |
| Desktop table | Select all and per-row selection checkboxes. Portfolio, Date, Action, Ticker, Price, Currency, Shares, Commission and two unlabeled trailing columns. Some rows have a linked source sheet and expansion icon. Items per page defaulted to 50. |
| Mobile list | Sort by selector showed Date. Descending is a separate direction control. Cards expose action, ticker where applicable, date, Price, Currency, Amount or share information, Commission, Portfolio and Note when available. Row icons include a source shortcut, trash and more actions. |
| Add Transaction | The page CTA and ticker dialog entry point both opened **Manage Transaction**, labeled **Step 1 of 2**. This account uses spreadsheets, so the dialog listed portfolio rows with Sync and linked-sheet controls, then Create Portfolio, Portfolio Settings and Done. Done closes it. No manual transaction-entry fields were exposed by the observed flow. |

The audit documents visible controls and the interactions tested in this account. Exact hover fields beyond Overview Value, every icon-only submenu, and any manual-portfolio transaction form remain unverified.
