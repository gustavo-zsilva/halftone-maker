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

  function circlesFor(marks, radiusIndex, scale) {
    var groups = new Map()
    for (var i = 0; i < marks.length; i += 7) {
      var radius = marks[i + radiusIndex] * scale
      if (radius <= 0) continue
      var color = radiusIndex === 3 ? '#ffffff' : hex(marks[i + 4], marks[i + 5], marks[i + 6])
      var bucket = groups.get(color)
      if (!bucket) {
        bucket = []
        groups.set(color, bucket)
      }
      bucket.push(
        '<circle cx="' + num(marks[i] * scale) + '" cy="' + num(marks[i + 1] * scale) + '" r="' + num(radius) + '"/>'
      )
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
      circlesFor(result.marks, 3, page.scale),
      close,
      underRects,
      '</g>',
      '<g id="cor" inkscape:groupmode="layer" inkscape:label="Cor">',
      open,
      circlesFor(result.marks, 2, page.scale),
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

  function buildPdf(result) {
    var pt = 72 / result.dpi
    var pageW = result.width * pt
    var pageH = result.height * pt
    var marks = result.marks
    var body = []
    var clip = result.outline ? pdfContour(result.outline.contours, pt, pageH) : ''
    if (clip) body.push('q\n' + clip + 'W*\nn\n')
    var last = ''
    for (var i = 0; i < marks.length; i += 7) {
      var radius = marks[i + 2] * pt
      if (radius <= 0) continue
      var key = (marks[i + 4] / 255).toFixed(4) + ' ' + (marks[i + 5] / 255).toFixed(4) + ' ' + (marks[i + 6] / 255).toFixed(4)
      if (key !== last) {
        body.push(key + ' rg\n')
        last = key
      }
      body.push(circlePath(marks[i] * pt, pageH - marks[i + 1] * pt, radius))
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

  window.HalftoneVector = {
    buildSvg: buildSvg,
    buildPdf: buildPdf,
  }
})()
