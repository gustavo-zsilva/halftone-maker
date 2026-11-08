// SVG e PDF vetoriais, no tamanho físico da impressão.
// O SVG usa milímetros e camadas do Inkscape: a base branca fica embaixo da cor.

(function () {
  var KAPPA = 0.5522847498

  function num(value) {
    return (Math.round(value * 1000) / 1000).toFixed(3)
  }

  function hex(red, green, blue) {
    var n = (1 << 24) | (red << 16) | (green << 8) | blue
    return '#' + n.toString(16).slice(1)
  }

  function mmPerPx(result) {
    return 25.4 / result.dpi
  }

  function pageMm(result) {
    var scale = mmPerPx(result)
    return {
      width: result.width * scale,
      height: result.height * scale,
      scale: scale,
    }
  }

  function pathData(contours, scale) {
    var parts = []
    for (var c = 0; c < contours.length; c++) {
      var pts = contours[c]
      if (pts.length < 3) continue
      parts.push('M' + num(pts[0][0] * scale) + ' ' + num(pts[0][1] * scale))
      for (var i = 1; i < pts.length; i++) {
        parts.push('L' + num(pts[i][0] * scale) + ' ' + num(pts[i][1] * scale))
      }
      parts.push('Z')
    }
    return parts.join('')
  }

  function rectsFor(runs, stride, scale, colorAt) {
    var groups = new Map()
    for (var i = 0; i < runs.length; i += stride) {
      var w = runs[i + 2] * scale
      var h = runs[i + 3] * scale
      if (w <= 0 || h <= 0) continue
      var color = colorAt(runs, i)
      var bucket = groups.get(color)
      if (!bucket) {
        bucket = []
        groups.set(color, bucket)
      }
      bucket.push(
        '<rect x="' + num(runs[i] * scale) + '" y="' + num(runs[i + 1] * scale) + '" width="' + num(w) + '" height="' + num(h) + '"/>'
      )
    }
    var parts = []
    groups.forEach(function (rects, color) {
      parts.push('<g fill="' + color + '" stroke="none">')
      parts.push(rects.join(''))
      parts.push('</g>')
    })
    return parts.join('')
  }

  function circlesFor(result, scale, under) {
    var marks = result.marks
    var ellipse = result.shape === 'ellipse'
    var stride = ellipse ? 9 : 7
    var groups = new Map()
    for (var i = 0; i < marks.length; i += stride) {
      var color = under ? '#ffffff' : hex(marks[i + (ellipse ? 6 : 4)], marks[i + (ellipse ? 7 : 5)], marks[i + (ellipse ? 8 : 6)])
      var shape = ''
      if (ellipse) {
        var rx = marks[i + (under ? 4 : 2)] * scale
        var ry = marks[i + (under ? 5 : 3)] * scale
        if (rx <= 0 || ry <= 0) continue
        var cx = num(marks[i] * scale)
        var cy = num(marks[i + 1] * scale)
        shape = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + num(rx) + '" ry="' + num(ry) +
          '" transform="rotate(' + num(result.angle || 0) + ' ' + cx + ' ' + cy + ')"/>'
      } else {
        var radius = marks[i + (under ? 3 : 2)] * scale
        if (radius <= 0) continue
        shape = '<circle cx="' + num(marks[i] * scale) + '" cy="' + num(marks[i + 1] * scale) + '" r="' + num(radius) + '"/>'
      }
      var bucket = groups.get(color)
      if (!bucket) {
        bucket = []
        groups.set(color, bucket)
      }
      bucket.push(shape)
    }
    var parts = []
    groups.forEach(function (circles, color) {
      parts.push('<g fill="' + color + '" stroke="none">')
      parts.push(circles.join(''))
      parts.push('</g>')
    })
    return parts.join('')
  }

  function buildSvg(result) {
    var page = pageMm(result)
    var width = num(page.width)
    var height = num(page.height)
    var outline = result.outline
    var clip = ''
    var open = ''
    var close = ''
    if (outline && outline.contours && outline.contours.length) {
      var d = pathData(outline.contours, page.scale)
      if (d) {
        clip = '<clipPath id="silhueta" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" fill-rule="evenodd" d="' + d + '"/></clipPath>'
        open = '<g clip-path="url(#silhueta)">'
        close = '</g>'
      }
    }
    var underRects = outline ? rectsFor(outline.underRuns, 4, page.scale, function () { return '#ffffff' }) : ''
    var colorRects = outline ? rectsFor(outline.colorRuns, 7, page.scale, function (runs, i) {
      return hex(runs[i + 4], runs[i + 5], runs[i + 6])
    }) : ''
    var parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="' + width + 'mm" height="' + height + 'mm" viewBox="0 0 ' + width + ' ' + height + '">',
      clip,
      '<g id="base-branca" inkscape:groupmode="layer" inkscape:label="Base branca">',
      open,
      circlesFor(result, page.scale, true),
      close,
      underRects,
      '</g>',
      '<g id="cor" inkscape:groupmode="layer" inkscape:label="Cor">',
      open,
      circlesFor(result, page.scale, false),
      close,
      colorRects,
      '</g>',
      '</svg>',
    ]
    return new Blob(parts, { type: 'image/svg+xml' })
  }

  function circlePath(cx, cy, radius) {
    var c = KAPPA * radius
    return num(cx + radius) + ' ' + num(cy) + ' m ' +
      num(cx + radius) + ' ' + num(cy + c) + ' ' + num(cx + c) + ' ' + num(cy + radius) + ' ' + num(cx) + ' ' + num(cy + radius) + ' c ' +
      num(cx - c) + ' ' + num(cy + radius) + ' ' + num(cx - radius) + ' ' + num(cy + c) + ' ' + num(cx - radius) + ' ' + num(cy) + ' c ' +
      num(cx - radius) + ' ' + num(cy - c) + ' ' + num(cx - c) + ' ' + num(cy - radius) + ' ' + num(cx) + ' ' + num(cy - radius) + ' c ' +
      num(cx + c) + ' ' + num(cy - radius) + ' ' + num(cx + radius) + ' ' + num(cy - c) + ' ' + num(cx + radius) + ' ' + num(cy) + ' c f\n'
  }

  function pdfContour(contours, pt, pageH) {
    if (!contours || !contours.length) return ''
    var out = []
    for (var c = 0; c < contours.length; c++) {
      var pts = contours[c]
      if (pts.length < 3) continue
      out.push(num(pts[0][0] * pt) + ' ' + num(pageH - pts[0][1] * pt) + ' m\n')
      for (var i = 1; i < pts.length; i++) {
        out.push(num(pts[i][0] * pt) + ' ' + num(pageH - pts[i][1] * pt) + ' l\n')
      }
      out.push('h\n')
    }
    return out.join('')
  }

  function pdfRects(runs, stride, pt, pageH, colorAt) {
    var body = []
    var last = ''
    for (var i = 0; i < runs.length; i += stride) {
      var w = runs[i + 2] * pt
      var h = runs[i + 3] * pt
      if (w <= 0 || h <= 0) continue
      var key = colorAt(runs, i)
      if (key !== last) {
        body.push(key + ' rg\n')
        last = key
      }
      var x = runs[i] * pt
      var y = pageH - (runs[i + 1] * pt + h)
      body.push(num(x) + ' ' + num(y) + ' ' + num(w) + ' ' + num(h) + ' re\nf\n')
    }
    return body.join('')
  }

  function ellipsePath(cx, cy, rx, ry, angleDeg) {
    var rad = (angleDeg || 0) * Math.PI / 180
    var cos = Math.cos(rad)
    var sin = Math.sin(rad)
    return 'q\n' +
      num(cos * rx) + ' ' + num(-sin * rx) + ' ' + num(sin * ry) + ' ' + num(cos * ry) + ' ' + num(cx) + ' ' + num(cy) + ' cm\n' +
      circlePath(0, 0, 1) +
      'Q\n'
  }

  function buildPdf(result) {
    var pt = 72 / result.dpi
    var pageW = result.width * pt
    var pageH = result.height * pt
    var marks = result.marks
    var ellipse = result.shape === 'ellipse'
    var stride = ellipse ? 9 : 7
    var body = []
    var clip = result.outline ? pdfContour(result.outline.contours, pt, pageH) : ''
    if (clip) body.push('q\n' + clip + 'W*\nn\n')
    var last = ''
    for (var i = 0; i < marks.length; i += stride) {
      var key
      var path
      if (ellipse) {
        var rx = marks[i + 2] * pt
        var ry = marks[i + 3] * pt
        if (rx <= 0 || ry <= 0) continue
        key = (marks[i + 6] / 255).toFixed(4) + ' ' + (marks[i + 7] / 255).toFixed(4) + ' ' + (marks[i + 8] / 255).toFixed(4)
        path = ellipsePath(marks[i] * pt, pageH - marks[i + 1] * pt, rx, ry, -(result.angle || 0))
      } else {
        var radius = marks[i + 2] * pt
        if (radius <= 0) continue
        key = (marks[i + 4] / 255).toFixed(4) + ' ' + (marks[i + 5] / 255).toFixed(4) + ' ' + (marks[i + 6] / 255).toFixed(4)
        path = circlePath(marks[i] * pt, pageH - marks[i + 1] * pt, radius)
      }
      if (key !== last) {
        body.push(key + ' rg\n')
        last = key
      }
      body.push(path)
    }
    if (clip) body.push('Q\n')
    if (result.outline) {
      body.push(pdfRects(result.outline.colorRuns, 7, pt, pageH, function (runs, index) {
        return (runs[index + 4] / 255).toFixed(4) + ' ' + (runs[index + 5] / 255).toFixed(4) + ' ' + (runs[index + 6] / 255).toFixed(4)
      }))
    }
    return wrapPdf(pageW, pageH, body.join(''))
  }

  function wrapPdf(pageW, pageH, stream) {
    var header = '%PDF-1.4\n'
    var objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW.toFixed(2) + ' ' + pageH.toFixed(2) + '] /Contents 4 0 R /Resources << >> >>\nendobj\n',
      '4 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream\nendobj\n',
    ]
    var offset = header.length
    var offsets = [0]
    var body = header
    for (var i = 0; i < objects.length; i++) {
      offsets.push(offset)
      body += objects[i]
      offset += objects[i].length
    }
    var xref = 'xref\n0 5\n0000000000 65535 f \n'
    for (var n = 1; n <= 4; n++) {
      xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n'
    }
    var trailer = 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + offset + '\n%%EOF\n'
    return new Blob([body + xref + trailer], { type: 'application/pdf' })
  }

  function base64(bytes) {
    var bin = ''
    var chunk = 0x8000
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    return btoa(bin)
  }

  function buildRasterSvg(result, colorBytes, underBytes) {
    var page = pageMm(result)
    var width = num(page.width)
    var height = num(page.height)
    var colorHref = 'data:image/png;base64,' + base64(colorBytes)
    var underHref = 'data:image/png;base64,' + base64(underBytes)
    var image = function (href) {
      return '<image href="' + href + '" width="' + width + '" height="' + height + '" preserveAspectRatio="none"/>'
    }
    var parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="' + width + 'mm" height="' + height + 'mm" viewBox="0 0 ' + width + ' ' + height + '">',
      '<g id="base-branca" inkscape:groupmode="layer" inkscape:label="Base branca">',
      image(underHref),
      '</g>',
      '<g id="cor" inkscape:groupmode="layer" inkscape:label="Cor">',
      image(colorHref),
      '</g>',
      '</svg>',
    ]
    return new Blob(parts, { type: 'image/svg+xml' })
  }

  async function deflateZlib(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  function ascii(value) {
    return new TextEncoder().encode(value)
  }

  function concatBytes(parts) {
    var total = 0
    for (var i = 0; i < parts.length; i++) total += parts[i].length
    var out = new Uint8Array(total)
    var offset = 0
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], offset)
      offset += parts[j].length
    }
    return out
  }

  async function buildRasterPdf(result) {
    var width = result.width
    var height = result.height
    var pt = 72 / result.dpi
    var pageW = (width * pt).toFixed(2)
    var pageH = (height * pt).toFixed(2)
    var rgb = new Uint8Array(width * height * 3)
    var alpha = new Uint8Array(width * height)
    var src = result.color
    for (var i = 0, p = 0, q = 0; i < alpha.length; i++, p += 4, q += 3) {
      rgb[q] = src[p]
      rgb[q + 1] = src[p + 1]
      rgb[q + 2] = src[p + 2]
      alpha[i] = src[p + 3]
    }
    var rgbZ = await deflateZlib(rgb)
    var alphaZ = await deflateZlib(alpha)
    var content = ascii('q\n' + pageW + ' 0 0 ' + pageH + ' 0 0 cm\n/Im Do\nQ\n')
    var objects = [
      ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
      ascii('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n'),
      ascii('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R >> >> >>\nendobj\n'),
      concatBytes([
        ascii('4 0 obj\n<< /Length ' + content.length + ' >>\nstream\n'),
        content,
        ascii('endstream\nendobj\n'),
      ]),
      concatBytes([
        ascii('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ' + rgbZ.length + ' /SMask 6 0 R >>\nstream\n'),
        rgbZ,
        ascii('\nendstream\nendobj\n'),
      ]),
      concatBytes([
        ascii('6 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ' + alphaZ.length + ' >>\nstream\n'),
        alphaZ,
        ascii('\nendstream\nendobj\n'),
      ]),
    ]
    var header = ascii('%PDF-1.4\n')
    var offset = header.length
    var offsets = [0]
    var chunks = [header]
    for (var n = 0; n < objects.length; n++) {
      offsets.push(offset)
      chunks.push(objects[n])
      offset += objects[n].length
    }
    var xref = 'xref\n0 7\n0000000000 65535 f \n'
    for (var k = 1; k <= 6; k++) {
      xref += String(offsets[k]).padStart(10, '0') + ' 00000 n \n'
    }
    xref += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + offset + '\n%%EOF\n'
    chunks.push(ascii(xref))
    return new Blob([concatBytes(chunks)], { type: 'application/pdf' })
  }

  window.HalftoneVector = {
    buildSvg: buildSvg,
    buildPdf: buildPdf,
    buildRasterSvg: buildRasterSvg,
    buildRasterPdf: buildRasterPdf,
  }
})()
