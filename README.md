# MCCB Frame QA

Local prototype for digitising switchboard frame install, serial capture, electrical testing, and handover. All data stays in this browser (IndexedDB). No login.

## Run

This machine did not have Node on PATH, so a portable Node 22 lives in `.tools/node` (gitignored). From the project folder:

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Camera QR/OCR needs localhost (or HTTPS).

## Flow

1. New frame — Shepherd / ACTSW IDs, module serial, INT/AUS, start date/time
2. Install checklist + CBSDS A–D
3. Per-breaker serials (typed, Micrologic QR, MCCB green-sticker OCR + confirm)
4. Ancillary circuits
5. Electrical testing (frame IR, A1–D8 IR/polarity, shunt trip live test)
6. Handover + Download PDF / Print

Shunt trip batch numbers apply to 63A/100A only; 32A positions have no coil.
