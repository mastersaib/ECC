/**
 * Dependency-free exporters for Galley: DOCX (stored ZIP of WordprocessingML),
 * PDF (Times, WinAnsi encoding) and plain text. *Asterisk* spans become
 * italics in DOCX and PDF, so sound effects and thoughts marked in the
 * editor arrive italicized. Works offline: no library is fetched.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleyExport = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------------ zip

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  /** Build an uncompressed ZIP. files: [{ name, data: string | Uint8Array }] */
  function zip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const DOS_DATE = 0x21; // 1980-01-01, keeps output deterministic
    for (const file of files) {
      const name = utf8(file.name);
      const data = typeof file.data === 'string' ? utf8(file.data) : file.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, 0, true);
      local.setUint16(12, DOS_DATE, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, 0, true);
      cd.setUint16(14, DOS_DATE, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((sum, p) => sum + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return concat(parts.concat(central, [new Uint8Array(end.buffer)]));
  }

  function concat(arrays) {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const a of arrays) {
      out.set(a, at);
      at += a.length;
    }
    return out;
  }

  // --------------------------------------------------------------- italics

  /** Split a paragraph into [{ text, italic }] runs using *asterisk* spans. */
  function runs(paragraph) {
    const out = [];
    const re = /\*([^*\n]+)\*/g;
    let last = 0;
    for (const m of paragraph.matchAll(re)) {
      if (m.index > last) out.push({ text: paragraph.slice(last, m.index), italic: false });
      out.push({ text: m[1], italic: true });
      last = m.index + m[0].length;
    }
    if (last < paragraph.length) out.push({ text: paragraph.slice(last), italic: false });
    return out;
  }

  // ------------------------------------------------------------------ docx

  function xmlEscape(text) {
    return text
      // eslint-disable-next-line no-control-regex -- strip characters XML 1.0 forbids
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function docxParagraph(paragraph, opts) {
    const body = runs(paragraph).map(run =>
      `<w:r>${run.italic ? '<w:rPr><w:i/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape(run.text)}</w:t></w:r>`
    ).join('');
    const style = opts.heading ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : '';
    return `<w:p>${style}${body}</w:p>`;
  }

  function docxStyles(doubleSpaced) {
    const line = doubleSpaced ? 480 : 276;
    const indent = doubleSpaced ? '<w:ind w:firstLine="720"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
      '<w:sz w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
      `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/>${indent}</w:pPr></w:pPrDefault></w:docDefaults>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>' +
      '</w:styles>';
  }

  /**
   * opts: { title, text, doubleSpaced, lang }  ->  Uint8Array (.docx)
   */
  function toDocx(opts) {
    const paragraphs = String(opts.text || '').split('\n');
    const body = (opts.title ? docxParagraph(opts.title, { heading: true }) : '') +
      paragraphs.map(p => docxParagraph(p, {})).join('');
    const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
    const lang = opts.lang || 'en-US';
    return zip([
      {
        name: '[Content_Types].xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '</Types>'
      },
      {
        name: '_rels/.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
          '</Relationships>'
      },
      {
        name: 'docProps/core.xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
          `<dc:title>${xmlEscape(opts.title || 'Manuscript')}</dc:title><dc:language>${xmlEscape(lang)}</dc:language>` +
          '</cp:coreProperties>'
      },
      {
        name: 'word/_rels/document.xml.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>'
      },
      { name: 'word/styles.xml', data: docxStyles(opts.doubleSpaced !== false) },
      { name: 'word/document.xml', data: document }
    ]);
  }

  // ------------------------------------------------------------------- pdf

  // Times-Roman advance widths (1/1000 em) for ASCII 32-126.
  const TIMES_WIDTHS = [
    250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
    500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
    921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
    556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
    333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
    500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541
  ];
  // Unicode -> WinAnsi byte for the punctuation manuscripts actually use.
  const WIN_ANSI = {
    0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
    0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x20AC: 0x80, 0x2122: 0x99,
    0x0152: 0x8C, 0x0153: 0x9C, 0x0160: 0x8A, 0x0161: 0x9A, 0x0178: 0x9F
  };
  const WIDE = { 0x91: 333, 0x92: 333, 0x93: 444, 0x94: 444, 0x95: 350, 0x96: 500, 0x97: 1000, 0x85: 1000 };

  function winAnsiByte(ch) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code < 127) return code;
    if (WIN_ANSI[code]) return WIN_ANSI[code];
    if (code >= 0xA0 && code <= 0xFF) return code;
    return 0x3F; // '?'
  }

  function charWidth(byte) {
    if (byte >= 32 && byte < 127) return TIMES_WIDTHS[byte - 32];
    return WIDE[byte] || 500;
  }

  function encodeLine(text) {
    let out = '';
    let width = 0;
    for (const ch of text) {
      const b = winAnsiByte(ch);
      width += charWidth(b);
      if (b === 0x28 || b === 0x29 || b === 0x5C) out += `\\${String.fromCharCode(b)}`;
      else if (b < 0x80) out += String.fromCharCode(b);
      else out += `\\${b.toString(8).padStart(3, '0')}`;
    }
    return { out, width };
  }

  function measure(text, size) {
    return encodeLine(text).width * size / 1000;
  }

  /** Lay out paragraphs into pages of lines; each line is a list of runs. */
  function layout(paragraphs, opts) {
    const { size, leading, width, height, indent } = opts;
    const pages = [];
    let page = [];
    let y = 0;
    const pushLine = (line, x0) => {
      if (y + leading > height) {
        pages.push(page);
        page = [];
        y = 0;
      }
      page.push({ y, x0, runs: line });
      y += leading;
    };
    for (const para of paragraphs) {
      if (para.heading) {
        pushLine([{ text: para.text, italic: false, bold: true }], (width - measure(para.text, size + 2)) / 2);
        y += leading / 2;
        continue;
      }
      if (!para.text.trim()) {
        pushLine([], 0);
        continue;
      }
      const words = [];
      for (const run of runs(para.text)) {
        for (const piece of run.text.split(/(\s+)/)) if (piece) words.push({ text: piece, italic: run.italic });
      }
      let line = [];
      let lineWidth = 0;
      let first = true;
      const limit = () => width - (first ? indent : 0);
      for (const word of words) {
        const w = measure(word.text, size);
        if (lineWidth + w > limit() && line.length && !/^\s+$/.test(word.text)) {
          pushLine(line, first ? indent : 0);
          first = false;
          line = [];
          lineWidth = 0;
        }
        if (!line.length && /^\s+$/.test(word.text)) continue;
        line.push(word);
        lineWidth += w;
      }
      if (line.length) pushLine(line, first ? indent : 0);
    }
    if (page.length || !pages.length) pages.push(page);
    return pages;
  }

  /**
   * opts: { title, text, doubleSpaced }  ->  Uint8Array (.pdf, US Letter)
   */
  function toPdf(opts) {
    const size = 12;
    const doubleSpaced = opts.doubleSpaced !== false;
    const leading = doubleSpaced ? 24 : 15;
    const margin = 72;
    const pageW = 612;
    const pageH = 792;
    const paragraphs = [];
    if (opts.title) paragraphs.push({ text: opts.title, heading: true });
    for (const p of String(opts.text || '').split('\n')) paragraphs.push({ text: p });
    const pages = layout(paragraphs, {
      size, leading, width: pageW - margin * 2, height: pageH - margin * 2 - leading, indent: doubleSpaced ? 36 : 0
    });

    const objects = [];
    const add = body => {
      objects.push(body);
      return objects.length;
    };
    const catalog = add(null);
    const pagesObj = add(null);
    const fonts = {
      F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
      F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>'),
      F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>')
    };
    const kids = [];
    pages.forEach((lines, index) => {
      let stream = '';
      for (const line of lines) {
        const y = pageH - margin - size - line.y;
        let x = margin + line.x0;
        for (const run of line.runs) {
          const font = run.bold ? 'F3' : run.italic ? 'F2' : 'F1';
          const { out } = encodeLine(run.text);
          stream += `BT /${font} ${run.bold ? size + 2 : size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${out}) Tj ET\n`;
          x += measure(run.text, run.bold ? size + 2 : size);
        }
      }
      const footer = encodeLine(String(index + 1)).out;
      stream += `BT /F1 10 Tf ${(pageW / 2 - 3).toFixed(2)} 40 Td (${footer}) Tj ET\n`;
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /Font << /F1 ${fonts.F1} 0 R /F2 ${fonts.F2} 0 R /F3 ${fonts.F3} 0 R >> >> /Contents ${content} 0 R >>`));
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title (${encodeLine(opts.title || 'Manuscript').out}) /Producer (Galley) >>`);

    let pdf = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
    return bytes;
  }

  // ---------------------------------------------------------------- report

  /** Plain-text proofreading report, one finding per paragraph. */
  function reportText(text, issues, profile) {
    const lineOf = pos => text.slice(0, pos).split('\n').length;
    const header = [
      `Proofreading report: ${profile.dialectName}, ${profile.guideName}`,
      `${issues.length} finding${issues.length === 1 ? '' : 's'}`,
      ''
    ];
    const body = issues.map((issue, n) => {
      const change = issue.replacement === null || issue.replacement === undefined
        ? 'Note'
        : issue.replacement === '' ? `Delete "${issue.text}"` : `"${issue.text}" → "${issue.replacement}"`;
      return `${n + 1}. Paragraph ${lineOf(issue.start)} [${issue.category}, ${issue.severity}] ${issue.message} ${change}.`;
    });
    return header.concat(body).join('\n');
  }

  return { zip, crc32, runs, toDocx, toPdf, reportText };
}));
