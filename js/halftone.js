// Halftone para impressão DTF.
// Cada bolinha sai opaca (alfa 255) e redonda. O resto fica alfa 0.
// Não há antialias: um pixel semitransparente faz o RIP colocar branco
// por baixo e cria uma auréola clara na prensa.

(function () {
  function screenMetrics(maxDotMm, gap) {
    const pitchMm = maxDotMm * (1 + gap)
    return {
      pitchMm: pitchMm,
      lpi: 25.4 / pitchMm,
    }
  }

  function clamp8(value) {
    if (value < 0) return 0
    if (value > 255) return 255
    return Math.round(value)
  }

  function stamp(data, width, height, cx, cy, radius, red, green, blue) {
    if (radius <= 0) return
    const r2 = radius * radius
    const y0 = Math.max(0, Math.ceil(cy - radius))
    const y1 = Math.min(height - 1, Math.floor(cy + radius))
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy
      const span = r2 - dy * dy
      if (span < 0) continue
      const dx = Math.sqrt(span)
      let x0 = Math.ceil(cx - dx)
      let x1 = Math.floor(cx + dx)
      if (x0 < 0) x0 = 0
      if (x1 >= width) x1 = width - 1
      if (x0 > x1) continue
      let offset = (y * width + x0) * 4
      for (let x = x0; x <= x1; x++) {
        data[offset] = red
        data[offset + 1] = green
        data[offset + 2] = blue
        data[offset + 3] = 255
        offset += 4
      }
    }
  }

  function isSampleInk(src, index, alphaCutoff, knockout, tolerance) {
    const alpha = src[index + 3]
    if (alpha < alphaCutoff) return false
    const red = src[index]
    const green = src[index + 1]
    const blue = src[index + 2]
    if (knockout === 'white' && red >= 255 - tolerance && green >= 255 - tolerance && blue >= 255 - tolerance) return false
    if (knockout === 'black' && red <= tolerance && green <= tolerance && blue <= tolerance) return false
    return true
  }

  function clearPixel(data, offset) {
    data[offset] = 0
    data[offset + 1] = 0
    data[offset + 2] = 0
    data[offset + 3] = 0
  }

  // Distância euclidiana ao quadrado até o 0 mais próximo.
  // f contém 0 nas fontes e um valor grande no resto.
  function transform1d(f, n, v, z, d) {
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      const vk = v[k]
      d[q] = (q - vk) * (q - vk) + f[vk]
    }
  }

  function distanceSquared(sources, width, height) {
    const cols = width + 2
    const rows = height + 2
    const far = 1e15
    const grid = new Float64Array(cols * rows)
    grid.fill(far)
    for (let y = 0; y < rows; y++) {
      grid[y * cols] = 0
      grid[y * cols + cols - 1] = 0
    }
    for (let x = 0; x < cols; x++) {
      grid[x] = 0
      grid[(rows - 1) * cols + x] = 0
    }
    for (let y = 0; y < height; y++) {
      const src = y * width
      const dst = (y + 1) * cols + 1
      for (let x = 0; x < width; x++) {
        if (sources[src + x]) grid[dst + x] = 0
      }
    }

    const span = Math.max(cols, rows)
    const v = new Int32Array(span)
    const z = new Float64Array(span + 1)
    const line = new Float64Array(span)
    const next = new Float64Array(span)
    const tmp = new Float64Array(cols * rows)

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) line[y] = grid[y * cols + x]
      transform1d(line, rows, v, z, next)
      for (let y = 0; y < rows; y++) tmp[y * cols + x] = next[y]
    }
    for (let y = 0; y < rows; y++) {
      const row = y * cols
      for (let x = 0; x < cols; x++) line[x] = tmp[row + x]
      transform1d(line, cols, v, z, next)
      for (let x = 0; x < cols; x++) grid[row + x] = next[x]
    }

    const dist = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
      const src = (y + 1) * cols + 1
      const dst = y * width
      for (let x = 0; x < width; x++) dist[dst + x] = grid[src + x]
    }
    return dist
  }

  function simplifyClosed(points) {
    const n = points.length
    if (n < 3) return points
    const out = []
    for (let i = 0; i < n; i++) {
      const a = points[(i + n - 1) % n]
      const b = points[i]
      const c = points[(i + 1) % n]
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      if (cross !== 0) out.push(b)
    }
    return out.length >= 3 ? out : points
  }

  // Contorno da tinta, inclusive buracos, para o SVG recortar as bolinhas.
  function traceContours(mask, width, height) {
    const visited = new Uint8Array(width * height)
    const dirs = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ]
    const paths = []

    function inkAt(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0
      return mask[y * width + x]
    }

    function dirIndex(dx, dy) {
      for (let k = 0; k < 8; k++) {
        if (dirs[k][0] === dx && dirs[k][1] === dy) return k
      }
      return 0
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const start = y * width + x
        if (!mask[start] || inkAt(x - 1, y) || visited[start]) continue
        const path = []
        let cx = x
        let cy = y
        let bx = x - 1
        let by = y
        let guard = 0
        const limit = width * height + 8
        while (guard++ < limit) {
          path.push([cx, cy])
          const bi = dirIndex(bx - cx, by - cy)
          let found = false
          let nx = cx
          let ny = cy
          let nbx = bx
          let nby = by
          for (let step = 1; step <= 8; step++) {
            const look = (bi + step) % 8
            const lx = cx + dirs[look][0]
            const ly = cy + dirs[look][1]
            if (inkAt(lx, ly)) {
              const prev = (look + 7) % 8
              nbx = cx + dirs[prev][0]
              nby = cy + dirs[prev][1]
              nx = lx
              ny = ly
              found = true
              break
            }
          }
          if (!found) break
          cx = nx
          cy = ny
          bx = nbx
          by = nby
          if (cx === x && cy === y && bx === x - 1 && by === y) break
        }
        for (let p = 0; p < path.length; p++) {
          const px = path[p][0]
          const py = path[p][1]
          if (px >= 0 && py >= 0 && px < width && py < height && !inkAt(px - 1, py)) {
            visited[py * width + px] = 1
          }
        }
        const simple = simplifyClosed(path)
        if (simple.length >= 3) paths.push(simple)
      }
    }
    return paths
  }

  function RunMerger() {
    this.done = []
    this.open = new Map()
  }

  RunMerger.prototype.row = function (y, runs) {
    const next = new Map()
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]
      const key = run.x + ':' + run.w + ':' + run.r + ':' + run.g + ':' + run.b
      const prev = this.open.get(key)
      if (prev && prev.y + prev.h === y) {
        prev.h += 1
        next.set(key, prev)
      } else {
        const item = { x: run.x, y: y, w: run.w, h: 1, r: run.r, g: run.g, b: run.b }
        this.done.push(item)
        next.set(key, item)
      }
    }
    this.open = next
  }

  function flattenRuns(items, withColor) {
    const out = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      out.push(item.x, item.y, item.w, item.h)
      if (withColor) out.push(item.r, item.g, item.b)
    }
    return out
  }

  async function buildOutline(src, color, underbase, width, height, params, shouldContinue) {
    const alphaCutoff = params.alphaCutoff
    const knockout = params.knockout
    const tolerance = params.tolerance
    const grayscale = !!params.grayscale
    const choke = params.choke > 0 ? params.choke : 0
    const thickness = (params.outlineMm / 25.4) * params.dpi
    if (!(thickness >= 0.5)) return { colorRuns: [], underRuns: [], contours: [] }

    const kind = new Uint8Array(width * height)
    for (let i = 0, p = 0; i < kind.length; i++, p += 4) {
      if (isSampleInk(src, p, alphaCutoff, knockout, tolerance)) kind[i] = 1
    }
    if (!shouldContinue()) return null

    const stack = []
    function seed(x, y) {
      const i = y * width + x
      if (kind[i] !== 0) return
      kind[i] = 2
      stack.push(i)
    }
    for (let x = 0; x < width; x++) {
      seed(x, 0)
      if (height > 1) seed(x, height - 1)
    }
    for (let y = 1; y < height - 1; y++) {
      seed(0, y)
      if (width > 1) seed(width - 1, y)
    }
    while (stack.length) {
      const i = stack.pop()
      const x = i % width
      const y = (i - x) / width
      if (x > 0 && kind[i - 1] === 0) { kind[i - 1] = 2; stack.push(i - 1) }
      if (x + 1 < width && kind[i + 1] === 0) { kind[i + 1] = 2; stack.push(i + 1) }
      if (y > 0 && kind[i - width] === 0) { kind[i - width] = 2; stack.push(i - width) }
      if (y + 1 < height && kind[i + width] === 0) { kind[i + width] = 2; stack.push(i + width) }
    }
    if (!shouldContinue()) return null

    const outside = new Uint8Array(width * height)
    for (let i = 0; i < kind.length; i++) outside[i] = kind[i] === 2 ? 1 : 0
    const dist2 = distanceSquared(outside, width, height)
    if (!shouldContinue()) return null

    const mask = new Uint8Array(width * height)
    const colorMerger = new RunMerger()
    const underMerger = new RunMerger()
    const colorRow = []
    const underRow = []

    for (let y = 0; y < height; y++) {
      if ((y & 63) === 0) {
        if (!shouldContinue()) return null
        await new Promise(function (resolve) { setTimeout(resolve, 0) })
      }
      colorRow.length = 0
      underRow.length = 0
      let runX = 0
      let runW = 0
      let runR = 0
      let runG = 0
      let runB = 0
      let underX = 0
      let underW = 0

      function flushColor() {
        if (runW > 0) colorRow.push({ x: runX, w: runW, r: runR, g: runG, b: runB })
        runW = 0
      }
      function flushUnder() {
        if (underW > 0) underRow.push({ x: underX, w: underW, r: 255, g: 255, b: 255 })
        underW = 0
      }

      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const offset = i * 4
        if (kind[i] !== 1) {
          flushColor()
          flushUnder()
          clearPixel(color, offset)
          clearPixel(underbase, offset)
          continue
        }
        mask[i] = 1
        const dist = Math.sqrt(dist2[i])
        if (dist > thickness) {
          flushColor()
          flushUnder()
          continue
        }

        let red = src[offset]
        let green = src[offset + 1]
        let blue = src[offset + 2]
        if (grayscale) {
          const gray = clamp8(0.299 * red + 0.587 * green + 0.114 * blue)
          red = gray
          green = gray
          blue = gray
        }
        color[offset] = red
        color[offset + 1] = green
        color[offset + 2] = blue
        color[offset + 3] = 255
        if (runW > 0 && x === runX + runW && red === runR && green === runG && blue === runB) {
          runW++
        } else {
          flushColor()
          runX = x
          runW = 1
          runR = red
          runG = green
          runB = blue
        }

        if (dist > choke) {
          underbase[offset] = 255
          underbase[offset + 1] = 255
          underbase[offset + 2] = 255
          underbase[offset + 3] = 255
          if (underW > 0 && x === underX + underW) underW++
          else {
            flushUnder()
            underX = x
            underW = 1
          }
        } else {
          flushUnder()
          clearPixel(underbase, offset)
        }
      }
      flushColor()
      flushUnder()
      colorMerger.row(y, colorRow)
      underMerger.row(y, underRow)
    }

    if (!shouldContinue()) return null
    return {
      colorRuns: flattenRuns(colorMerger.done, true),
      underRuns: flattenRuns(underMerger.done, false),
      contours: traceContours(mask, width, height),
    }
  }

  function axisRange(min, max, pitch) {
    const first = Math.floor((min - pitch) / pitch) * pitch + pitch / 2
    const end = max + pitch
    const count = Math.max(0, Math.ceil((end - first) / pitch))
    return { first: first, count: count }
  }

  async function createHalftone(imageData, params, shouldContinue, onProgress) {
    const width = imageData.width
    const height = imageData.height
    const src = imageData.data
    const dpi = params.dpi
    const metrics = screenMetrics(params.maxDotMm, params.gap)
    const pitchPx = (metrics.pitchMm / 25.4) * dpi
    const maxRadius = (params.maxDotMm / 25.4) * dpi * 0.5
    const minDiameter = (params.minDotMm / 25.4) * dpi

    if (!(pitchPx >= 2) || !(maxRadius > 0)) {
      throw new Error('O tamanho das bolinhas ficou pequeno demais para 300 DPI.')
    }

    const angle = (params.angle * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const toU = function (x, y) { return x * cos + y * sin }
    const toV = function (x, y) { return -x * sin + y * cos }
    const toX = function (u, v) { return u * cos - v * sin }
    const toY = function (u, v) { return u * sin + v * cos }

    let uMin = Infinity
    let uMax = -Infinity
    let vMin = Infinity
    let vMax = -Infinity
    const corners = [[0, 0], [width, 0], [0, height], [width, height]]
    for (let i = 0; i < corners.length; i++) {
      const u = toU(corners[i][0], corners[i][1])
      const v = toV(corners[i][0], corners[i][1])
      if (u < uMin) uMin = u
      if (u > uMax) uMax = u
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
    }

    const uAxis = axisRange(uMin, uMax, pitchPx)
    const vAxis = axisRange(vMin, vMax, pitchPx)
    const total = uAxis.count * vAxis.count
    const half = pitchPx * 0.72
    const alphaCutoff = params.alphaCutoff
    const tolerance = params.tolerance
    const knockout = params.knockout
    const variation = params.variation
    const exponent = params.contrast > 0 ? params.contrast : 1
    const impact = params.impact > 0 ? Math.min(1, params.impact) : 0
    const grayscale = !!params.grayscale
    const choke = params.choke

    const color = new Uint8ClampedArray(width * height * 4)
    const underbase = new Uint8ClampedArray(width * height * 4)
    const marks = []
    let dots = 0
    let dropped = 0
    let promoted = 0
    let processed = 0

    for (let iu = 0; iu < uAxis.count; iu++) {
      const u = uAxis.first + iu * pitchPx
      for (let iv = 0; iv < vAxis.count; iv++) {
        if ((processed & 2047) === 0) {
          if (!shouldContinue()) return null
          if (onProgress) onProgress(processed, total)
          await new Promise(function (resolve) { setTimeout(resolve, 0) })
        }
        processed++

        const v = vAxis.first + iv * pitchPx
        const cx = toX(u, v)
        const cy = toY(u, v)
        if (cx < -maxRadius || cy < -maxRadius || cx > width + maxRadius || cy > height + maxRadius) {
          continue
        }

        const x0 = Math.max(0, Math.floor(cx - half))
        const x1 = Math.min(width - 1, Math.ceil(cx + half))
        const y0 = Math.max(0, Math.floor(cy - half))
        const y1 = Math.min(height - 1, Math.ceil(cy + half))
        if (x0 > x1 || y0 > y1) continue

        let samples = 0
        let weight = 0
        let sr = 0
        let sg = 0
        let sb = 0
        let sl = 0

        // Uma grade de até 6×6 amostras cobre a célula. Linhas mais finas que o
        // piso de impressão podem escapar; o que importa para o DTF é a mancha.
        const spanX = x1 - x0
        const spanY = y1 - y0
        const samplesX = spanX < 5 ? spanX + 1 : 6
        const samplesY = spanY < 5 ? spanY + 1 : 6
        const stepX = samplesX <= 1 ? 1 : spanX / (samplesX - 1)
        const stepY = samplesY <= 1 ? 1 : spanY / (samplesY - 1)

        for (let sy = 0; sy < samplesY; sy++) {
          const y = Math.min(y1, y0 + Math.round(sy * stepY))
          for (let sx = 0; sx < samplesX; sx++) {
            const x = Math.min(x1, x0 + Math.round(sx * stepX))
            const idx = (y * width + x) * 4
            const alpha = src[idx + 3]
            const red = src[idx]
            const green = src[idx + 1]
            const blue = src[idx + 2]
            samples++
            const isWeak = alpha < alphaCutoff
            const isWhite = knockout === 'white' && red >= 255 - tolerance && green >= 255 - tolerance && blue >= 255 - tolerance
            const isBlack = knockout === 'black' && red <= tolerance && green <= tolerance && blue <= tolerance
            if (!isWeak && !isWhite && !isBlack) {
              const aw = alpha / 255
              weight += aw
              sr += red * aw
              sg += green * aw
              sb += blue * aw
              sl += (0.299 * red + 0.587 * green + 0.114 * blue) * aw
            }
          }
        }

        if (samples === 0 || weight < 0.001) continue

        const coverageAlpha = Math.min(1, weight / samples)
        const inv = 1 / weight
        let darkness = 1 - (sl * inv) / 255
        if (darkness < 0) darkness = 0
        if (darkness > 1) darkness = 1
        darkness = Math.pow(darkness, exponent)
        if (impact > 0) {
          // Os claros seguem abertos. Do meio-tom para o escuro, a bolinha
          // cresce até o tamanho máximo. O vão entre elas não fecha.
          const shadow = Math.min(1, Math.max(0, (darkness - 0.28) / 0.42))
          darkness = darkness + (1 - darkness) * impact * Math.pow(shadow, 0.85)
        }

        let coverage = coverageAlpha * ((1 - variation) + variation * darkness)
        if (coverage > 1) coverage = 1
        if (coverage <= 0.002) {
          dropped++
          continue
        }

        let diameter = maxRadius * 2 * Math.sqrt(coverage)
        let didPromote = false
        if (diameter < minDiameter) {
          // Linha fina vira bolinha no piso de 0,5 mm. Campo claro demais sai fora,
          // porque bolinha menor que isso não segura o pó.
          if (coverageAlpha >= 0.18 && coverageAlpha < 0.85) {
            diameter = minDiameter
            didPromote = true
          } else {
            dropped++
            continue
          }
        }

        const radius = diameter / 2
        let red = clamp8(sr * inv)
        let green = clamp8(sg * inv)
        let blue = clamp8(sb * inv)
        if (grayscale) {
          const gray = clamp8(0.299 * red + 0.587 * green + 0.114 * blue)
          red = gray
          green = gray
          blue = gray
        }
        stamp(color, width, height, cx, cy, radius, red, green, blue)
        const underRadius = Math.max(radius - choke, Math.min(radius, 0.75))
        if (underRadius > 0) {
          stamp(underbase, width, height, cx, cy, underRadius, 255, 255, 255)
        }
        marks.push(cx, cy, radius, underRadius > 0 ? underRadius : 0, red, green, blue)
        if (didPromote) promoted++
        else dots++
      }
    }

    if (!shouldContinue()) return null
    if (onProgress) onProgress(total, total)

    let outline = null
    if (params.outlineMm > 0) {
      outline = await buildOutline(src, color, underbase, width, height, params, shouldContinue)
      if (!outline) return null
    }

    return {
      color: color,
      underbase: underbase,
      marks: marks,
      outline: outline,
      width: width,
      height: height,
      dpi: dpi,
      stats: {
        dots: dots,
        dropped: dropped,
        promoted: promoted,
        printed: dots + promoted,
        lpi: metrics.lpi,
        pitchMm: metrics.pitchMm,
        maxDotMm: params.maxDotMm,
        minDotMm: params.minDotMm,
      },
    }
  }

  window.Halftone = {
    createHalftone: createHalftone,
    screenMetrics: screenMetrics,
  }
})()
