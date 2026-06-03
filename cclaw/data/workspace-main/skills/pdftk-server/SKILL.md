---
name: pdftk-server
description: Command-line PDF manipulation using PDFtk Server. Use for merging, splitting, encrypting, decrypting, watermarking, stamping, rotating, filling forms, extracting metadata, and repairing PDF files.
---

# PDFtk Server

PDFtk Server is a command-line tool for working with PDF documents. It can merge, split, rotate, encrypt, decrypt, watermark, stamp, fill forms, extract metadata, and manipulate PDFs in a variety of ways.

## Prerequisites

- PDFtk Server must be installed on the system:
  - **Linux (Debian/Ubuntu):** `sudo apt-get install pdftk`
  - **macOS:** `brew install pdftk-java`
  - **Windows:** `winget install --id PDFLabs.PDFtk.Server`
- Verify: `pdftk --version`

## Key Operations

### Merge Multiple PDFs
```bash
pdftk file1.pdf file2.pdf cat output merged.pdf
```

Using handles for more control:
```bash
pdftk A=file1.pdf B=file2.pdf cat A B output merged.pdf
```

### Split a PDF into Individual Pages
```bash
pdftk input.pdf burst
```

### Extract Specific Pages
Extract pages 1-5 and 10-15:
```bash
pdftk input.pdf cat 1-5 10-15 output extracted.pdf
```

### Remove Specific Pages
Remove page 13:
```bash
pdftk input.pdf cat 1-12 14-end output output.pdf
```

### Rotate Pages
Rotate all pages 90 degrees clockwise:
```bash
pdftk input.pdf cat 1-endeast output rotated.pdf
```

### Encrypt a PDF
Set owner password and user password with 128-bit encryption:
```bash
pdftk input.pdf output secured.pdf owner_pw mypassword user_pw userpass
```

### Decrypt a PDF
```bash
pdftk secured.pdf input_pw mypassword output unsecured.pdf
```

### Fill a PDF Form
```bash
pdftk form.pdf fill_form data.fdf output filled.pdf flatten
```

### Apply a Background Watermark
```bash
pdftk input.pdf background watermark.pdf output watermarked.pdf
```

### Stamp an Overlay
```bash
pdftk input.pdf stamp overlay.pdf output stamped.pdf
```

### Extract Metadata
```bash
pdftk input.pdf dump_data output metadata.txt
```

### Repair a Corrupted PDF
```bash
pdftk broken.pdf output fixed.pdf
```

### Collate Scanned Pages
```bash
pdftk A=even.pdf B=odd.pdf shuffle A B output collated.pdf
```

## Common Options

| Option | Description |
|--------|-------------|
| `cat` | Combine pages from multiple PDFs |
| `burst` | Split PDF into individual pages |
| `dump_data` | Extract metadata and bookmarks |
| `fill_form` | Fill PDF form fields |
| `background` | Add background watermark |
| `stamp` | Add foreground overlay |
| `encrypt` | Encrypt with password |
| `flatten` | Merge form fields into page content |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `pdftk: command not found` | Install pdftk; check PATH |
| Cannot decrypt PDF | Use correct `input_pw` password |
| Output file empty/corrupt | Try `pdftk input.pdf output repaired.pdf` first |
| Form fields not visible | Use `flatten` flag |
| Watermark not appearing | Ensure input PDF has transparency |
