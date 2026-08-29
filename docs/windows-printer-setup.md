# Windows printer setup

This guide configures both shop printers on a Windows client. The menu names
below follow Windows 11; Windows 10 exposes the equivalent controls under
**Settings → Devices → Printers & scanners**. Because Windows 10 support ended
in October 2025, Windows 11 is recommended for the production client.

| Purpose | Printer | Application output |
| --- | --- | --- |
| Invoices and EMI receipts | Rongta thermal receipt printer | 58 mm or 80 mm thermal |
| Product labels | Gprinter GP-3120TUC | 38 mm × 25 mm thermal labels |

The two printers can remain installed and connected at the same time. They must
be separate Windows printer queues with distinct names, drivers, ports, and
paper defaults.

The application uses the browser's normal print pipeline. The Vercel server does
not connect to the USB printers: the Windows PC, installed drivers, browser, and
Windows Print Spooler perform the physical printing. No local print bridge or
`THERMAL_PRINT_ALLOWED_ORIGINS` setting is required for this workflow.

## Before installing

1. Sign in to Windows with an account allowed to install printer drivers.
2. Run Windows Update, including applicable optional driver updates.
3. Check the model printed on the Rongta's underside or rear label. Do not select
   a driver based only on a generic queue name such as `80Series`.
4. Confirm the label printer is **GP-3120TUC**. Do not select GP-3210 or another
   similar-looking model.
5. Disconnect both printer USB cables. Install and test one printer at a time so
   Windows does not associate a driver with the wrong USB device.
6. Use the same physical USB ports after installation. Moving a printer to a
   different port can make Windows create another USB printer port or queue.

Download drivers only from the manufacturers:

- [Rongta Windows thermal receipt driver](https://www.rongtatech.com/download/)
- [Gprinter Windows barcode/label drivers](https://www.gprinter.net/tmqd/)
- [GP-3120TUC specifications](https://www.gprinter.net/tmdyj/229.html)

The GP-3120TUC is a 203 DPI, TSPL label printer. Gprinter's official driver page
lists its Seagull barcode-printer driver for Windows 10 and Windows 11.

## Install the Rongta receipt printer

1. Run the official Rongta **Thermal Receipt Printer Driver (Windows)** installer.
2. Select the exact model from the printer's physical model label.
3. When requested, connect and power on only the Rongta printer.
4. Allow the installer to create its USB printer port.
5. Open **Settings → Bluetooth & devices → Printers & scanners**.
6. Open the newly installed printer, then **Printer properties → General** and
   rename it to `Rongta Receipt`.
7. Open **Printer properties → Ports** and confirm it uses its own USB port. Do
   not assign the GP-3120TUC's port.
8. Print a Windows test page. Do not continue until the test page prints.

Open **Printing preferences** and use these starting settings where the driver
offers them:

- Paper/roll width: the width physically loaded in the printer.
- Cutter: cut at end of document or job.
- Feed after print: approximately 6 mm, then adjust only if the cutter leaves too
  little or too much paper.
- Cash drawer: disabled unless a drawer is connected.
- Orientation: portrait.

Use the matching application layout:

- A physical 58 mm roll: select **58 mm thermal**.
- A physical 80 mm roll: select **80 mm thermal**.
- A normal office printer: select **A4 invoice**.

The application generates a receipt with a content-dependent length. Some
Rongta drivers expose only fixed forms such as 58 × 210, 58 × 297, or
58 × 3276 mm. If the Windows driver maps the generated receipt to one of these
forms, the printer may feed or cut at that fixed length. That limitation is in
the installed driver/form; repeatedly changing the receipt layout will not make
the driver support true continuous-length pages. Prefer a **Receipt**,
**Continuous**, **Roll**, **Document size**, or equivalent driver option if the
exact model's Windows driver provides one.

## Install the GP-3120TUC label printer

1. Run Gprinter's official Windows barcode-printer driver. The official Seagull
   driver is the preferred starting point.
2. Select **GP-3120TUC** and its 203 DPI variant if the installer lists multiple
   resolutions.
3. When requested, connect and power on only the GP-3120TUC.
4. Open **Settings → Bluetooth & devices → Printers & scanners**.
5. Open the installed printer and rename it to `GP-3120TUC Labels`.
6. Confirm under **Printer properties → Ports** that it uses a different USB
   port from `Rongta Receipt`.
7. Print the driver's Windows test page.

### Create the 38 × 25 mm stock

First check **Printing preferences → Page Setup/Stock/Paper** for an existing
38 mm × 25 mm size. If it does not exist, use one of these methods:

1. Prefer the driver's **New**, **Custom**, or **User-defined stock** command.
2. Otherwise open **Control Panel → Devices and Printers → Print server
   properties → Forms**.
3. Enable **Create a new form** and enter:

   - Form name: `Label 38x25`
   - Width: `38.00 mm`
   - Height: `25.00 mm`
   - All printer-area margins: `0.00 mm`

4. Save the form, reopen the GP-3120TUC's **Printing preferences**, and select
   `Label 38x25`.

Use these initial label settings:

- Size: 38 mm wide × 25 mm high.
- Print method: direct thermal.
- Sensor/media: gap label, not continuous paper or black mark.
- Gap: 2 mm, or the measured gap on the actual roll.
- Resolution: 203 DPI.
- Orientation: portrait.
- Speed: begin at 2–3 inches/second for barcode testing.
- Darkness/density: begin near the middle of the driver's range. Increase it
  only if bars are pale; reduce it if adjacent bars spread together.
- Copies in the Windows/browser dialog: 1. The application itself generates the
  requested number of labels.

Run the driver's media/sensor calibration after loading the roll. A single press
of the printer's Feed button should then advance exactly one label to the next
gap. If it skips labels or stops between gaps, recalibrate before testing the
application.

## Prevent Windows from switching printers

Open **Settings → Bluetooth & devices → Printers & scanners → Printer
preferences** and turn off **Let Windows manage my default printer**. When this
option is enabled, Windows can make the last-used printer the new default.

Either set a normal office printer as the default, or choose one thermal printer
as the default and still verify the destination for every job. Do not use the
same display name for both thermal queues.

Recommended queue names:

- `Rongta Receipt`
- `GP-3120TUC Labels`

## Configure the browser

After installing or changing a printer driver, completely close and reopen
Chrome or Edge so it reloads the Windows printer capabilities.

The application cannot select a Windows printer automatically. Browser security
requires the operator to choose the destination in the print dialog.

### Receipt job

1. In the application, choose A4, 58 mm thermal, or 80 mm thermal as appropriate.
2. Click **Print**.
3. Select `Rongta Receipt`.
4. In **More settings**, use:

   - Paper size: the matching Rongta roll/receipt form.
   - Scale: 100%/Actual size.
   - Margins: None.
   - Headers and footers: Off.
   - Pages per sheet: 1.

5. Confirm the preview shows only the receipt, then print.

### Label job

1. Open **Stock → Print labels**.
2. Select the product or units and choose **Thermal — 38 × 25 mm**.
3. Click the application's print button.
4. Select `GP-3120TUC Labels`.
5. In **More settings**, use:

   - Paper size: `Label 38x25`/38 × 25 mm.
   - Layout: Portrait.
   - Scale: 100; do not use Fit to page.
   - Margins: None.
   - Headers and footers: Off.
   - Pages per sheet: 1.
   - Browser copies: 1.

6. Check that the preview contains exactly one sheet per requested label and no
   trailing blank sheet.
7. Print one label first and scan it before printing a batch.

Chrome remembers settings, but always check the destination when switching
between receipts and labels. A printer name shown as selected does not prove the
correct paper form is active.

## Acceptance test

Perform this test before using the Windows PC in production:

| Test | Expected result |
| --- | --- |
| Windows Rongta test page | Prints only from Rongta |
| Windows GP-3120TUC test page | Prints only from GP-3120TUC |
| One 38 × 25 mm application label | One physical label, no blank label |
| Three application labels | Three physical labels, no fourth blank label |
| Scan serial-product label | Scanner returns the exact printed serial number |
| Scan quantity-product label | Scanner returns the saved numeric barcode |
| 58 mm invoice | Uses the Rongta 58 mm form and correct width |
| 80 mm invoice, if applicable | Uses the Rongta 80 mm form and correct width |
| EMI thermal receipt | Prints from Rongta using the selected width |
| A4 invoice | Prints from the office printer and remains A4 |
| Print after 10–15 minutes idle | Job appears in the Windows queue and prints |
| Switch label → receipt → label | Each job reaches the intended printer |

## Troubleshooting

### The application logs a print action but nothing prints

The application audit entry means the print button was accepted; it does not
confirm that the browser submitted a Windows print job.

1. Open **Settings → Bluetooth & devices → Printers & scanners → [printer] →
   Open print queue**.
2. If no job appears, reselect the destination in the browser and try once. Also
   test **Print using system dialog** (`Ctrl+Shift+P`).
3. If a job appears but remains queued, cancel stuck jobs, power-cycle only that
   printer, and restart the Windows **Print Spooler** service.
4. Confirm the printer is not marked **Use Printer Offline** or **Paused**.
5. Confirm Windows did not create a duplicate queue after the USB cable was
   moved.

### The wrong printer receives the job

- Turn off **Let Windows manage my default printer**.
- Check that the two queues use different USB ports.
- Rename the queues clearly.
- Select the destination again after switching between labels and receipts.

### A label feeds incorrectly

- Confirm 38 × 25 mm stock and 2 mm gap settings.
- Confirm gap sensing rather than continuous or black-mark sensing.
- Recalibrate the GP-3120TUC media sensor.
- Keep browser scaling at 100 and margins at None.

### A barcode does not scan

- Confirm the print dialog is not fitting or shrinking the label.
- Clean the print head and verify the label is not blurred or unusually pale.
- Reduce print speed before increasing darkness.
- Test the printed human-readable value with both the shop scanner and a phone.
- For quantity-tracked products, add or generate a numeric barcode in the
  product editor before printing. The application does not fall back to the SKU.

### Receipt length is fixed or wastes paper

Check the Rongta driver's available Windows forms and cutter options. If it only
offers fixed 210/297/3276 mm lengths, true content-length cutting remains a
driver limitation even though the application document itself is dynamically
sized.
