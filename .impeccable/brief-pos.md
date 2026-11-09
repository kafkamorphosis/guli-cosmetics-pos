# Unity Beauty POS — app surfaces

Scope: every authenticated POS screen (Kassa, Ombor, Buyurtmalar, Tekpe), login, admin, and the shell around them. Mode: Operate. The printed A4 sheet is its own surface and inherits this world in black and white.

Audience and job: owner and staff ringing up sales at a bright store counter on a Windows desktop with a USB scanner (primary), plus phones for checkout, stock and Tekpe. Avoid: slow flows, too many taps, cute/girly styling, hard-to-read numbers.

## Direction contract

THESIS: Every screen is a live 택배 waybill — ruled cells, field captions, one monumental figure — refusing the admin-template arrangement of floating rounded cards on a gray sidebar.

OWN-WORLD: Thermal-label white cells (#ffffff) ruled by 1px ink hairlines (#141414) with shared, collapsed borders, set on the client's blush ground (#fcf2f0). Cells are square inside an 8px-radius label edge; no shadows except a soft lift under overlays. Small caption labels sit top-left inside every field cell; values sit large below. The client blush (#f8ad9d, dark ink text) is the sort-zone block: primary actions and the current-step marker only. Active navigation inverts a cell to ink with white text. One grotesque family (Archivo): normal width for UI, condensed bold for monumental figures (totals, order numbers, sort-code style). All numerals tabular and right-aligned.

STORY: Staff glance once and know where they are, what is in the cart, and what it costs; they scan, set Optom per line, enter the phone, press Checkout or Tekpe, and print. Nothing asks them to hunt.

FIRST VIEWPORT: Desktop Kassa at 1440. A 52px header band ruled as cells: Unity mark + wordmark, nav cells Kassa/Ombor/Buyurtmalar/Tekpe (Kassa inverted), user cell and Chiqish at right. Below, a two-column label body: left ~62% — a full-width search cell with live scanner status at its right edge, then the cart as numbered ruled rows (No · photo · name over barcode digits · price · Optom · qty stepper · sum). Right ~38% — recipient cells (KR/UZ phone, name, Doimiy mijoz note), payment cells Naqd/Karta/Oʻtkazma, count and weight cells, then the total set monumental (~64px condensed bold, tabular) with the blush Checkout block (64px tall, full width) directly under it and the Tekpe block beside/below. Phone: header collapses to the wordmark; bottom bar of four ruled cells; cart full width; a sticky total strip opens the recipient sheet.

FORM: Taekbae Waybill — my top-ranked grounded candidate (position 1 of 7), chosen by the user as IMPECCABLE’S PICK over the assigned Pressed Compact. Seed key 6bd15de8. Kept discipline from the round: exact proportional stock bars (labanotation), list headers naming the span in view (lexicon), the order number as the only headline (catalog sleeve), tabular right-aligned numerals (datamatics). Signature interaction: thermal feed — a scanned line feeds into the cart from the top edge (clip reveal, 180ms ease-out) while the monumental total ticks to its new value.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
