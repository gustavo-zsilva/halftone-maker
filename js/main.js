(function () {
  var DPI = 300
  var MAX_PX = 4800

  var PRESETS = {
    open: { dot: 1.35, gap: 15, min: 0.6, tone: 35, impact: 0, angle: 22.5, contrast: 1, choke: 1 },
    dtf: { dot: 0.85, gap: 8, min: 0.5, tone: 50, impact: 40, angle: 22.5, contrast: 1.05, choke: 1 },
    fine: { dot: 0.7, gap: 6, min: 0.5, tone: 70, impact: 25, angle: 22.5, contrast: 1.1, choke: 1 },
    mesh: { dot: 0.67, gap: 8, min: 0.5, tone: 50, impact: 20, angle: 22.5, contrast: 1, choke: 1, shape: 'ellipse', levels: true },
  }

  var $ = function (id) { return document.getElementById(id) }

  var fileInput = $('file')
  var drop = $('drop')
  var dropTitle = $('dropTitle')
  var dropMeta = $('dropMeta')
  var widthInput = $('width')
  var noticesEl = $('notices')
  var downloadBtn = $('download')
  var downloadSvgBtn = $('downloadSvg')
  var downloadPdfBtn = $('downloadPdf')
  var downloadWhiteBtn = $('downloadWhite')
  var viewport = $('viewport')
  var sheet = $('sheet')
  var empty = $('empty')
  var view = $('view')
  var viewCtx = view.getContext('2d')
  var specEl = $('spec')
  var progressEl = $('progress')
  var progressLabel = $('progressLabel')
  var progressBar = $('progressBar')
  var knockHint = $('knockHint')
  var tolField = $('tolField')
  var knockColorField = $('knockColorField')

  var state = {
    job: 0,
    busy: false,
    exporting: false,
    bitmap: null,
    fileName: '',
    source: null,
    result: null,
    dpi: DPI,
    widthCm: 28,
    heightCm: 28,
    view: 'result',
    zoom: 'fit',
    mode: 'halftone',
    texture: 'circles',
    knockout: 'none',
    knockoutTouched: false,
    grayscale: false,
    shape: 'round',
    levels: false,
    invert: false,
    mesh: '',
    outline: false,
    smart: false,
    choke: 1,
    settingNotes: [],
    resultNotes: [],
  }

  function formatNumber(value, digits) {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  }

  function formatMm(value) {
    return formatNumber(value, 2) + ' mm'
  }

  function num(id) {
    return Number($(id).value)
  }

  function readParams() {
    var minDot = num('min')
    var maxDot = num('dot')
    if (minDot > maxDot) minDot = maxDot
    return {
      dpi: state.dpi,
      maxDotMm: maxDot,
      gap: num('gap') / 100,
      minDotMm: minDot,
      variation: num('tone') / 100,
      contrast: num('contrast'),
      angle: num('angle'),
      knockout: state.knockout,
      grayscale: state.grayscale,
      tolerance: num('tolerance'),
      alphaCutoff: Math.round((num('opacity') / 100) * 255),
      choke: state.choke,
      impact: num('impact') / 100,
      shape: state.shape,
      levels: state.levels,
      invert: state.invert,
      outlineMm: state.outline ? num('outlineMm') : 0,
      holeMm: num('hole'),
      holeOpen: num('light') / 100,
      texture: state.texture,
      knockColor: hexToRgb($('knockColor').value),
      smart: state.smart,
      mesh: state.mesh,
    }
  }

  function hexToRgb(hex) {
    var value = parseInt(String(hex).slice(1), 16)
    if (!Number.isFinite(value)) return [29, 78, 137]
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }

  function outputSize(bitmap, widthCm) {
    var aspect = bitmap.height / bitmap.width
    var maxWidthCm = (MAX_PX / DPI) * 2.54
    var limit = Math.min(maxWidthCm, maxWidthCm / aspect)
    var usedCm = Math.min(Math.max(widthCm, 5), limit)
    var widthPx = Math.round((usedCm / 2.54) * DPI)
    var heightPx = Math.max(1, Math.round(widthPx * aspect))
    if (heightPx > MAX_PX) {
      heightPx = MAX_PX
      widthPx = Math.max(1, Math.round(heightPx / aspect))
      usedCm = (widthPx / DPI) * 2.54
    }
    return {
      widthPx: widthPx,
      heightPx: heightPx,
      widthCm: usedCm,
      heightCm: usedCm * aspect,
      maxWidthCm: limit,
    }
  }

  function syncLabels() {
    $('dotOut').textContent = formatMm(num('dot'))
    $('gapOut').textContent = Math.round(num('gap')) + '%'
    $('minOut').textContent = formatMm(num('min'))
    $('toneOut').textContent = Math.round(num('tone')) + '%'
    $('impactOut').textContent = Math.round(num('impact')) + '%'
    $('outlineOut').textContent = formatMm(num('outlineMm'))
    $('outlineField').hidden = !state.outline || state.mode === 'holes'
    $('holeOut').textContent = formatMm(num('hole'))
    $('lightOut').textContent = Math.round(num('light')) + '%'
    $('angleOut').textContent = formatNumber(num('angle'), 1) + '°'
    $('widthOut').textContent = formatNumber(num('width'), 1) + ' cm'
    $('contrastOut').textContent = formatNumber(num('contrast'), 2)
    $('opacityOut').textContent = Math.round(num('opacity')) + '%'
    $('tolOut').textContent = String(Math.round(num('tolerance')))
    $('chokeOut').textContent = state.choke + ' px'
    tolField.hidden = state.knockout === 'none'
    knockColorField.hidden = state.knockout !== 'color'
    syncMode()
    updateSpec()
    updateSettingNotes()
    renderNotices()
  }

  function syncMode() {
    var holes = state.mode === 'holes'
    document.querySelectorAll('.halftone-only').forEach(function (el) {
      el.hidden = holes
    })
    $('holeFields').hidden = !holes
    $('viewResult').textContent = holes ? 'Com textura' : 'Halftone'
    $('modeHint').textContent = holes
      ? 'A arte original fica inteira, com uma textura que tira tinta para a estampa pesar menos.'
      : 'Bolinhas no lugar da tinta. O fundo continua transparente.'
    var angleHint = '22,5° deixa o padrão diagonal e evita cara de grade.'
    if (holes && state.texture === 'stripes') angleHint = '22,5° inclina as listras. Em 0° ou 90° elas acompanham o fio do tecido e parecem mais marcadas.'
    if (holes && state.texture === 'grid') angleHint = '22,5° gira a grade. Alinhada ao tecido, a trama fica mais evidente.'
    if (holes && state.texture === 'circles') angleHint = '22,5° espalha os círculos na diagonal, para não virar uma grade.'
    $('angleHint').textContent = angleHint
    $('holeLabel').textContent = state.texture === 'circles' ? 'Tamanho do furo' : 'Largura do vão'
    var textureHint = 'Círculos tiram tinta sem formar faixa. De perto aparecem; de longe a cor continua lisa.'
    if (state.texture === 'stripes') textureHint = 'Listras com vão de 0,7 mm e pelo menos 0,5 mm de tinta entre elas. A inclinação evita a faixa reta na camiseta.'
    if (state.texture === 'grid') textureHint = 'Duas listras cruzadas. O alívio é o total de tinta que sai, somando as duas direções.'
    $('textureHint').textContent = textureHint
    $('shapeHint').textContent = state.shape === 'ellipse'
      ? 'O ponto alonga na direção do ângulo, encadeia no tom fechado e deixa uma fresta na outra direção.'
      : 'O redondo segura o pó em qualquer direção. O elíptico alonga o ponto, encadeia no meio-tom e deixa uma fresta na outra direção.'
  }

  function updateSpec() {
    if (state.mode === 'holes') {
      var holes = window.Halftone.textureMetrics(state.texture, num('hole'), num('light') / 100)
      var textureName = state.texture === 'stripes' ? 'listras' : (state.texture === 'grid' ? 'grade' : 'círculos')
      var holeLine = textureName + ' de <strong>' + formatMm(num('hole')) + '</strong> · alívio <strong>' +
        formatNumber(holes.open * 100, 0) + '%</strong> · intervalo <strong>' + formatMm(holes.pitchMm) + '</strong>'
      if (!state.bitmap || !Number.isFinite(num('width'))) {
        specEl.innerHTML = 'Estampa com ' + holeLine + '.'
        return
      }
      var holeSize = outputSize(state.bitmap, num('width'))
      state.widthCm = holeSize.widthCm
      state.heightCm = holeSize.heightCm
      specEl.innerHTML = '<strong>' + formatNumber(holeSize.widthCm, 1) + ' × ' + formatNumber(holeSize.heightCm, 1) + ' cm</strong> · ' +
        holeSize.widthPx.toLocaleString('pt-BR') + ' × ' + holeSize.heightPx.toLocaleString('pt-BR') + ' px · <strong>300 DPI</strong> · ' + holeLine
      return
    }
    var metrics = window.Halftone.screenMetrics(num('dot'), num('gap') / 100)
    var lpi = formatNumber(metrics.lpi, 1)
    if (!state.bitmap || !Number.isFinite(num('width'))) {
      specEl.innerHTML = 'Predefinição em <strong>' + lpi + ' LPI</strong>, ' + (state.shape === 'ellipse' ? 'elipse' : 'bolinha') + ' de <strong>' + formatMm(num('dot')) + '</strong>, ângulo <strong>' + formatNumber(num('angle'), 1) + '°</strong>.'
      return
    }
    var size = outputSize(state.bitmap, num('width'))
    state.widthCm = size.widthCm
    state.heightCm = size.heightCm
    specEl.innerHTML = '<strong>' + formatNumber(size.widthCm, 1) + ' × ' + formatNumber(size.heightCm, 1) + ' cm</strong> · ' +
      size.widthPx.toLocaleString('pt-BR') + ' × ' + size.heightPx.toLocaleString('pt-BR') + ' px · <strong>300 DPI</strong> · <strong>' +
      lpi + ' LPI</strong> · ' + (state.shape === 'ellipse' ? 'elipse' : 'bolinha') + ' <strong>' + formatMm(num('dot')) + '</strong>' +
      (state.smart ? ' · transição' : '') +
      (state.invert ? ' · tons invertidos' : '')
  }

  function pushPracticeNotes(notes) {
    if (num('opacity') < 40) {
      notes.push({ level: 'warn', text: 'Corte de opacidade abaixo de 40%. A borda semitransparente ganha branco por baixo e vira auréola na prensa.' })
    }
    if (state.choke === 0) {
      notes.push({ level: 'warn', text: 'Base branca sem encolhimento. Um desvio mínimo na prensa deixa um fio branco na borda da cor.' })
    }
    if (state.knockout !== 'none' && num('tolerance') < 10) {
      notes.push({ level: 'warn', text: 'Tolerância abaixo de 10. Só sai a cor exata, e a borda suavizada dessa cor continua imprimindo.' })
    }
    if (state.outline && state.mode !== 'holes' && num('outlineMm') < 0.5) {
      notes.push({ level: 'warn', text: 'Contorno abaixo de 0,5 mm. Linha mais fina que isso costuma rachar ou sumir na lavagem.' })
    }
    if (state.bitmap) {
      var size = outputSize(state.bitmap, num('width'))
      if (state.bitmap.width < size.widthPx * 0.67) {
        notes.push({
          level: 'info',
          text: 'Para ficar nítida a 300 DPI nessa largura, a arte precisa ter cerca de ' + size.widthPx.toLocaleString('pt-BR') + ' px. A atual tem ' + state.bitmap.width.toLocaleString('pt-BR') + ' px.',
        })
      }
    }
  }

  function updateSettingNotes() {
    var notes = []
    if (state.mode === 'holes') {
      var texture = window.Halftone.textureMetrics(state.texture, num('hole'), num('light') / 100)
      if (num('hole') < 0.7) {
        notes.push({ level: 'warn', text: 'Vão abaixo de 0,7 mm. O pó e a prensa costumam fechar esse espaço, e a textura pode não aparecer na camiseta.' })
      }
      if (texture.open < 0.149) {
        notes.push({ level: 'warn', text: 'Alívio abaixo de 15%. A cobertura passa de 85% e os vãos pequenos tendem a fechar na prensa.' })
      }
      if (texture.clamped) {
        notes.push({ level: 'info', text: 'O intervalo foi aumentado para sobrar pelo menos 0,5 mm de tinta entre os vãos. Sem isso a faixa racha ou o furo vira rasgo.' })
      }
      var angle = num('angle')
      if (state.texture !== 'circles' && (angle <= 5 || angle >= 85)) {
        notes.push({ level: 'info', text: 'Textura em 0° ou 90°. A listra acompanha o fio do tecido e parece mais marcada. 22,5° disfarça.' })
      }
      pushPracticeNotes(notes)
      state.settingNotes = notes
      return
    }
    var metrics = window.Halftone.screenMetrics(num('dot'), num('gap') / 100)
    if (metrics.lpi > 38) {
      notes.push({ level: 'warn', text: 'Frequência acima de 38 LPI. Aumente o tamanho das bolinhas para o pó adesivo ter onde ancorar.' })
    } else if (metrics.lpi < 18) {
      notes.push({ level: 'info', text: 'Frequência abaixo de 18 LPI. O efeito fica gráfico e as bolinhas aparecem de longe.' })
    }
    if (num('dot') < 0.7) {
      notes.push({ level: 'warn', text: 'Bolinha abaixo de 0,7 mm. O pó pode não ancorar, e o ponto sai na lavagem.' })
    }
    if (num('min') < 0.5) {
      notes.push({ level: 'warn', text: 'Mínimo abaixo de 0,5 mm. Na prensa, essas bolinhas podem não transferir.' })
    }
    if (num('min') > num('dot')) {
      notes.push({ level: 'warn', text: 'O mínimo ficou maior que a bolinha. Ele será limitado ao tamanho escolhido.' })
    }
    if (num('gap') === 0 && state.shape !== 'ellipse') {
      notes.push({ level: 'warn', text: 'Sem espaço entre as bolinhas. No tom cheio elas encostam e o pó pode fechar a estampa numa chapa.' })
    }
    if (state.shape === 'ellipse') {
      var axes = window.Halftone.ellipseMetrics(num('dot'), num('gap') / 100)
      if (axes.slotMm < 0.6) {
        notes.push({ level: 'warn', text: 'A fresta do ponto elíptico ficou em ' + formatMm(axes.slotMm) + ', abaixo de 0,6 mm. O pó costuma fechar esse vão. Para a malha respirar, aumente o espaço ou use a predefinição Aberto.' })
      }
      if (axes.minorMm < 0.5) {
        notes.push({ level: 'warn', text: 'O eixo curto do ponto elíptico ficou abaixo de 0,5 mm. Ponto isolado nesse tamanho pode sair na lavagem.' })
      }
    }
    pushPracticeNotes(notes)
    state.settingNotes = notes
  }

  function renderNotices() {
    var items = state.settingNotes.concat(state.resultNotes)
    noticesEl.replaceChildren()
    items.forEach(function (item) {
      var p = document.createElement('p')
      p.className = item.level === 'warn' ? 'notice warn' : 'notice'
      p.textContent = item.text
      noticesEl.appendChild(p)
    })
  }

  function syncButtons() {
    var ready = !state.busy && !state.exporting && !!state.result
    downloadBtn.disabled = !ready
    downloadSvgBtn.disabled = !ready
    downloadPdfBtn.disabled = !ready
    downloadWhiteBtn.disabled = !ready
    $('viewResult').disabled = !state.result
    $('viewWhite').disabled = !state.result
    $('viewOriginal').disabled = !state.source
  }

  function setPressed(selector, attr, value) {
    document.querySelectorAll(selector).forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute(attr) === value ? 'true' : 'false')
    })
  }

  function clearPreset() {
    document.querySelectorAll('[data-preset]').forEach(function (button) {
      button.classList.remove('is-active')
    })
  }

  function applyPreset(name) {
    var preset = PRESETS[name]
    if (!preset) return
    $('dot').value = String(preset.dot)
    $('gap').value = String(preset.gap)
    $('min').value = String(preset.min)
    $('tone').value = String(preset.tone)
    $('impact').value = String(preset.impact)
    $('angle').value = String(preset.angle)
    $('contrast').value = String(preset.contrast)
    state.choke = preset.choke
    state.shape = preset.shape || 'round'
    state.levels = !!preset.levels
    setPressed('[data-choke]', 'data-choke', String(preset.choke))
    setPressed('[data-shape]', 'data-shape', state.shape)
    $('levels').setAttribute('aria-pressed', state.levels ? 'true' : 'false')
    $('shapeHint').textContent = state.shape === 'ellipse'
      ? 'O ponto alonga na direção do ângulo, encadeia no tom fechado e deixa uma fresta na outra direção.'
      : 'O redondo segura o pó em qualquer direção. O elíptico alonga o ponto, encadeia no meio-tom e deixa uma fresta na outra direção.'
    document.querySelectorAll('[data-preset]').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-preset') === name)
    })
    syncLabels()
    schedule()
  }

  function syncMeshPressed() {
    setPressed('[data-mesh]', 'data-mesh', state.mesh)
  }

  function setKnockout(value, options) {
    state.knockout = value
    if (!options || !options.fromMesh) {
      if (state.mesh === 'light' && value !== 'white') state.mesh = ''
      if (state.mesh === 'dark' && value !== 'black') {
        state.mesh = ''
        state.invert = false
      }
    }
    syncMeshPressed()
    setPressed('[data-knock]', 'data-knock', value)
    if (value === 'white') {
      knockHint.textContent = 'Tira o branco da arte inteira, não só do fundo. Numa camiseta branca, esse pedaço fica só o tecido.'
    } else if (value === 'black') {
      knockHint.textContent = 'Tira o preto da arte inteira. Numa camiseta preta, esse pedaço fica só o tecido.'
    } else if (value === 'color') {
      knockHint.textContent = 'Tira da arte a cor escolhida, e as parecidas dentro da tolerância. A camiseta aparece no lugar dela.'
    } else {
      knockHint.textContent = 'Nenhuma cor é tirada. A transparência da arte é respeitada.'
    }
    syncLabels()
    if (!options || !options.silent) schedule()
  }

  function suggestKnockout(bitmap) {
    var sampleW = Math.min(bitmap.width, 360)
    var sampleH = Math.max(1, Math.round(bitmap.height * (sampleW / bitmap.width)))
    var canvas = document.createElement('canvas')
    canvas.width = sampleW
    canvas.height = sampleH
    var ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, sampleW, sampleH)
    var data = ctx.getImageData(0, 0, sampleW, sampleH).data
    var border = 0
    var white = 0
    var black = 0
    var clear = 0
    var tol = 28
    for (var y = 0; y < sampleH; y++) {
      for (var x = 0; x < sampleW; x++) {
        var edge = x < 2 || y < 2 || x >= sampleW - 2 || y >= sampleH - 2
        var i = (y * sampleW + x) * 4
        if (data[i + 3] < 250) {
          if (edge) {
            border++
            clear++
          } else if (data[i + 3] < 250) {
            clear++
            border++
          }
          continue
        }
        if (!edge) continue
        border++
        var red = data[i]
        var green = data[i + 1]
        var blue = data[i + 2]
        if (red >= 255 - tol && green >= 255 - tol && blue >= 255 - tol) white++
        if (red <= tol && green <= tol && blue <= tol) black++
      }
    }

    var probe = document.createElement('canvas')
    probe.width = 64
    probe.height = 64
    var pctx = probe.getContext('2d', { willReadFrequently: true })
    var boxes = [
      [0, 0],
      [bitmap.width - 64, 0],
      [0, bitmap.height - 64],
      [bitmap.width - 64, bitmap.height - 64],
      [(bitmap.width - 64) / 2, (bitmap.height - 64) / 2],
    ]
    var foundClear = false
    for (var b = 0; b < boxes.length; b++) {
      pctx.clearRect(0, 0, 64, 64)
      pctx.drawImage(bitmap, Math.max(0, boxes[b][0]), Math.max(0, boxes[b][1]), 64, 64, 0, 0, 64, 64)
      var pixels = pctx.getImageData(0, 0, 64, 64).data
      for (var p = 3; p < pixels.length; p += 4) {
        if (pixels[p] < 250) {
          foundClear = true
          break
        }
      }
      if (foundClear) break
    }
    if (foundClear) return 'none'
    if (border > 0 && white / border > 0.55) return 'white'
    if (border > 0 && black / border > 0.55) return 'black'
    return 'none'
  }

  function drawSource(bitmap, widthPx, heightPx) {
    var canvas = document.createElement('canvas')
    canvas.width = widthPx
    canvas.height = heightPx
    var ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, widthPx, heightPx)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, widthPx, heightPx)
    return ctx.getImageData(0, 0, widthPx, heightPx)
  }

  async function decodeFile(file) {
    try {
      return await createImageBitmap(file)
    } catch (error) {
      var url = URL.createObjectURL(file)
      try {
        var image = await new Promise(function (resolve, reject) {
          var el = new Image()
          el.onload = function () { resolve(el) }
          el.onerror = function () { reject(new Error('Não consegui ler essa imagem. Use PNG, JPG ou WebP.')) }
          el.src = url
        })
        return await createImageBitmap(image)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  }

  function chooseWidth(bitmap) {
    var nativeCm = (bitmap.width / DPI) * 2.54
    var size = outputSize(bitmap, nativeCm)
    var widthCm = nativeCm
    if (widthCm < 8 || widthCm > size.maxWidthCm) {
      widthCm = Math.min(28, size.maxWidthCm)
    }
    widthCm = Math.min(widthCm, size.maxWidthCm)
    return Math.round(widthCm * 10) / 10
  }

  async function loadBitmap(bitmap, name) {
    if (state.bitmap && state.bitmap.close) state.bitmap.close()
    state.bitmap = bitmap
    state.fileName = name || 'arte'
    state.result = null
    state.source = null
    state.knockoutTouched = false
    state.resultNotes = []
    dropTitle.textContent = 'Trocar arte'
    dropMeta.textContent = bitmap.width.toLocaleString('pt-BR') + ' × ' + bitmap.height.toLocaleString('pt-BR') + ' px · ' + state.fileName
    var suggestion = suggestKnockout(bitmap)
    setKnockout(suggestion, { silent: true })
    var limit = outputSize(bitmap, 100).maxWidthCm
    widthInput.max = String(Math.floor(limit * 10) / 10)
    widthInput.value = String(Math.min(chooseWidth(bitmap), Number(widthInput.max)))
    syncLabels()
    syncButtons()
    await run()
  }

  async function loadFile(file) {
    if (!file) return
    if (file.type && file.type.indexOf('image/') !== 0) {
      pushError('Esse arquivo não é uma imagem.')
      return
    }
    try {
      var bitmap = await decodeFile(file)
      await loadBitmap(bitmap, file.name)
    } catch (error) {
      pushError(error.message || 'Não consegui ler essa imagem.')
    }
  }

  function pushError(text) {
    state.resultNotes = [{ level: 'warn', text: text }]
    renderNotices()
  }

  var timer = 0
  function schedule() {
    window.clearTimeout(timer)
    timer = window.setTimeout(run, 180)
  }

  async function run() {
    if (!state.bitmap) return
    if (!Number.isFinite(num('width')) || num('width') <= 0) return
    var my = ++state.job
    state.busy = true
    viewport.classList.add('is-busy')
    progressEl.hidden = false
    progressLabel.textContent = state.mode === 'holes'
      ? 'Aplicando a textura…'
      : (state.smart ? 'Lendo onde a arte muda…' : 'Montando as bolinhas…')
    progressBar.style.width = '0%'
    syncButtons()
    state.resultNotes = []
    renderNotices()

    try {
      var size = outputSize(state.bitmap, num('width'))
      state.dpi = DPI
      state.widthCm = size.widthCm
      state.heightCm = size.heightCm
      if (Math.abs(size.widthCm - num('width')) > 0.05) {
        widthInput.value = String(Math.round(size.widthCm * 10) / 10)
        syncLabels()
      }
      var source = drawSource(state.bitmap, size.widthPx, size.heightPx)
      if (my !== state.job) return
      state.source = source
      var params = readParams()
      params.dpi = DPI
      var generate = window.Halftone.createHalftone
      if (state.mode === 'holes') generate = window.Halftone.createPerforated
      else if (state.smart) generate = window.Halftone.createSmart
      var result = await generate(source, params, function () {
        return my === state.job
      }, function (done, total) {
        if (my !== state.job || !total) return
        progressBar.style.width = Math.min(100, Math.round((done / total) * 100)) + '%'
      })
      if (!result || my !== state.job) return
      state.result = result
      state.resultNotes = notesFromResult(result)
      paint()
    } catch (error) {
      if (my === state.job) pushError(error.message || 'Não consegui gerar o halftone.')
    } finally {
      if (my === state.job) {
        state.busy = false
        viewport.classList.remove('is-busy')
        progressEl.hidden = true
        syncButtons()
        renderNotices()
      }
    }
  }

  function notesFromResult(result) {
    var notes = []
    if (result.kind === 'holes') return notes
    var considered = result.stats.printed + result.stats.dropped
    if (considered > 0 && result.stats.dropped / considered > 0.15) {
      notes.push({
        level: 'info',
        text: 'Uma parte da arte ficou abaixo do tamanho mínimo e saiu do arquivo. Aumente as bolinhas ou baixe a abertura dos claros se alguma cor sumiu.',
      })
    }
    return notes
  }

  function paint() {
    var pixels = null
    var width = 0
    var height = 0
    if (state.view === 'original' && state.source) {
      pixels = state.source.data
      width = state.source.width
      height = state.source.height
    } else if (state.view === 'white' && state.result) {
      pixels = state.result.underbase
      width = state.result.width
      height = state.result.height
    } else if (state.result) {
      pixels = state.result.color
      width = state.result.width
      height = state.result.height
    }
    if (!pixels) return
    if (view.width !== width || view.height !== height) {
      view.width = width
      view.height = height
    }
    viewCtx.putImageData(new ImageData(pixels, width, height), 0, 0)
    sheet.hidden = false
    empty.hidden = true
    applyZoom()
  }

  function currentScale() {
    var canvasW = view.width || 1
    var canvasH = view.height || 1
    if (state.zoom === 'fit') {
      var availW = Math.max(80, viewport.clientWidth - 56)
      var availH = Math.max(80, viewport.clientHeight - 56)
      return Math.min(2, availW / canvasW, availH / canvasH)
    }
    return state.zoom
  }

  function applyZoom() {
    if (!view.width) return
    var scale = currentScale()
    view.style.width = Math.max(1, Math.round(view.width * scale)) + 'px'
    view.style.height = Math.max(1, Math.round(view.height * scale)) + 'px'
    view.style.imageRendering = scale >= 0.999 ? 'pixelated' : 'auto'
  }

  function zoomBy(direction) {
    var steps = [0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3]
    var current = currentScale()
    var next = steps[0]
    if (direction > 0) {
      next = steps[steps.length - 1]
      for (var i = 0; i < steps.length; i++) {
        if (steps[i] > current + 0.01) {
          next = steps[i]
          break
        }
      }
    } else {
      for (var j = steps.length - 1; j >= 0; j--) {
        if (steps[j] < current - 0.01) {
          next = steps[j]
          break
        }
      }
    }
    state.zoom = next
    applyZoom()
  }

  function zoomByWheel(event) {
    if (!view.width) return
    var oldScale = currentScale()
    var delta = event.deltaY
    if (event.deltaMode === 1) delta *= 16
    else if (event.deltaMode === 2) delta *= 400
    var next = oldScale * Math.exp(-delta * 0.0016)
    if (next < 0.08) next = 0.08
    if (next > 6) next = 6
    if (Math.abs(next - oldScale) < 0.0001) return

    var sheetRect = sheet.getBoundingClientRect()
    var pointX = (event.clientX - sheetRect.left) / Math.max(1, sheetRect.width)
    var pointY = (event.clientY - sheetRect.top) / Math.max(1, sheetRect.height)
    var cursorX = event.clientX
    var cursorY = event.clientY

    state.zoom = next
    applyZoom()

    var nextRect = sheet.getBoundingClientRect()
    viewport.scrollLeft -= cursorX - (nextRect.left + pointX * nextRect.width)
    viewport.scrollTop -= cursorY - (nextRect.top + pointY * nextRect.height)
  }

  function exportStem(kind) {
    if (kind === 'holes') return '-furos'
    if (kind === 'smart') return '-transicao'
    return '-halftone'
  }

  function baseName() {
    var name = state.fileName.replace(/\.[^.]+$/, '')
    name = name.replace(/[^\p{L}\p{N}\-_]+/gu, '-').replace(/^-+|-+$/g, '')
    return name || 'arte'
  }

  async function encodePng(pixels, width, height, dpi) {
    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    var ctx = canvas.getContext('2d')
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0)
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png') })
    if (!blob) throw new Error('O navegador não gerou o PNG. Reduza a largura.')
    var bytes = new Uint8Array(await blob.arrayBuffer())
    return window.injectPngDpi(bytes, dpi)
  }

  function saveBytes(bytes, filename) {
    saveBlob(new Blob([bytes], { type: 'image/png' }), filename)
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 1500)
  }

  async function withExport(label, work) {
    if (!state.result || state.busy || state.exporting) return
    state.exporting = true
    syncButtons()
    progressEl.hidden = false
    progressLabel.textContent = label
    progressBar.style.width = '100%'
    await new Promise(function (resolve) { setTimeout(resolve, 0) })
    try {
      await work()
    } catch (error) {
      pushError(error.message || 'Não consegui gerar o arquivo.')
    } finally {
      state.exporting = false
      progressEl.hidden = true
      syncButtons()
    }
  }

  function exportPng(kind) {
    withExport('Gerando PNG…', async function () {
      var pixels = kind === 'white' ? state.result.underbase : state.result.color
      var suffix = exportStem(state.result.kind)
      suffix = kind === 'white' ? suffix + '-base-branca.png' : suffix + '-dtf.png'
      var bytes = await encodePng(pixels, state.result.width, state.result.height, DPI)
      saveBytes(bytes, baseName() + suffix)
    })
  }

  function exportSvg() {
    withExport('Gerando SVG…', async function () {
      if (state.result.kind === 'holes' || state.result.kind === 'smart') {
        var colorPng = await encodePng(state.result.color, state.result.width, state.result.height, DPI)
        var underPng = await encodePng(state.result.underbase, state.result.width, state.result.height, DPI)
        saveBlob(window.HalftoneVector.buildRasterSvg(state.result, colorPng, underPng), baseName() + exportStem(state.result.kind) + '.svg')
        return
      }
      saveBlob(window.HalftoneVector.buildSvg(state.result), baseName() + '-halftone.svg')
    })
  }

  function exportPdf() {
    withExport('Gerando PDF…', async function () {
      if (state.result.kind === 'holes' || state.result.kind === 'smart') {
        saveBlob(await window.HalftoneVector.buildRasterPdf(state.result), baseName() + exportStem(state.result.kind) + '.pdf')
        return
      }
      saveBlob(window.HalftoneVector.buildPdf(state.result), baseName() + '-halftone.pdf')
    })
  }

  async function useDemo() {
    var canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 2200
    var ctx = canvas.getContext('2d')
    ctx.scale(2, 2)
    ctx.clearRect(0, 0, 900, 1100)
    ctx.fillStyle = '#e23d2b'
    ctx.beginPath()
    ctx.arc(450, 470, 280, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f2c14b'
    ctx.beginPath()
    ctx.arc(450, 430, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f7f4ee'
    ctx.beginPath()
    ctx.arc(400, 400, 28, 0, Math.PI * 2)
    ctx.arc(500, 400, 28, 0, Math.PI * 2)
    ctx.fill()
    var gradient = ctx.createLinearGradient(140, 860, 760, 860)
    gradient.addColorStop(0, '#142033')
    gradient.addColorStop(1, '#8ecae6')
    ctx.fillStyle = gradient
    ctx.fillRect(140, 800, 620, 180)
    ctx.strokeStyle = '#17140f'
    ctx.lineWidth = 26
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(180, 190)
    ctx.bezierCurveTo(300, 40, 620, 40, 740, 210)
    ctx.stroke()
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png') })
    var bitmap = await createImageBitmap(blob)
    await loadBitmap(bitmap, 'exemplo.png')
  }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0]
    if (file) loadFile(file)
    fileInput.value = ''
  })

  ;['dragenter', 'dragover'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (!event.dataTransfer) return
      event.preventDefault()
      drop.classList.add('is-over')
    })
  })
  ;['dragleave', 'drop'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (type === 'dragleave' && event.target !== document.documentElement) return
      drop.classList.remove('is-over')
    })
  })
  document.addEventListener('drop', function (event) {
    if (!event.dataTransfer) return
    event.preventDefault()
    drop.classList.remove('is-over')
    var file = event.dataTransfer.files && event.dataTransfer.files[0]
    if (file) loadFile(file)
  })
  window.addEventListener('paste', function (event) {
    var items = event.clipboardData && event.clipboardData.files
    if (!items) return
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        loadFile(items[i])
        break
      }
    }
  })

  ;['dot', 'gap', 'min', 'tone', 'impact', 'angle', 'contrast', 'opacity', 'tolerance'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (id === 'dot' || id === 'gap' || id === 'min' || id === 'tone' || id === 'impact' || id === 'angle' || id === 'contrast') {
        clearPreset()
      }
      syncLabels()
      schedule()
    })
  })

  widthInput.addEventListener('input', function () {
    syncLabels()
    schedule()
  })
  widthInput.addEventListener('change', function () {
    var max = Number(widthInput.max) || 40
    var min = Number(widthInput.min) || 5
    var value = Number(widthInput.value)
    if (!Number.isFinite(value)) value = 28
    value = Math.min(max, Math.max(min, value))
    widthInput.value = String(Math.round(value * 10) / 10)
    syncLabels()
    schedule()
  })

  document.querySelectorAll('[data-preset]').forEach(function (button) {
    button.addEventListener('click', function () {
      applyPreset(button.getAttribute('data-preset'))
    })
  })
  document.querySelectorAll('[data-shape]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.shape = button.getAttribute('data-shape')
      setPressed('[data-shape]', 'data-shape', state.shape)
      clearPreset()
      syncLabels()
      schedule()
    })
  })
  $('smart').addEventListener('click', function () {
    state.smart = !state.smart
    $('smart').setAttribute('aria-pressed', state.smart ? 'true' : 'false')
    syncLabels()
    schedule()
  })
  $('levels').addEventListener('click', function () {
    state.levels = !state.levels
    $('levels').setAttribute('aria-pressed', state.levels ? 'true' : 'false')
    clearPreset()
    syncLabels()
    schedule()
  })
  document.querySelectorAll('[data-mesh]').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-mesh')
      state.knockoutTouched = true
      if (state.mesh === value) {
        state.mesh = ''
        state.invert = false
        setKnockout('none', { fromMesh: true })
        return
      }
      state.mesh = value
      state.invert = value === 'dark'
      state.levels = true
      $('levels').setAttribute('aria-pressed', 'true')
      setKnockout(value === 'dark' ? 'black' : 'white', { fromMesh: true })
    })
  })
  document.querySelectorAll('[data-knock]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.knockoutTouched = true
      setKnockout(button.getAttribute('data-knock'))
    })
  })
  document.querySelectorAll('[data-choke]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.choke = Number(button.getAttribute('data-choke'))
      setPressed('[data-choke]', 'data-choke', String(state.choke))
      clearPreset()
      syncLabels()
      schedule()
    })
  })
  document.querySelectorAll('[data-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.view = button.getAttribute('data-view')
      setPressed('[data-view]', 'data-view', state.view)
      paint()
    })
  })
  document.querySelectorAll('[data-bg]').forEach(function (button) {
    button.addEventListener('click', function () {
      var bg = button.getAttribute('data-bg')
      setPressed('[data-bg]', 'data-bg', bg)
      if (bg === 'checker') {
        sheet.classList.add('is-checker')
        sheet.style.backgroundColor = ''
      } else {
        sheet.classList.remove('is-checker')
        sheet.style.backgroundColor = bg
      }
    })
  })
  $('shirt').addEventListener('input', function (event) {
    setPressed('[data-bg]', 'data-bg', '')
    sheet.classList.remove('is-checker')
    sheet.style.backgroundColor = event.target.value
  })

  $('gray').addEventListener('click', function () {
    state.grayscale = !state.grayscale
    $('gray').setAttribute('aria-pressed', state.grayscale ? 'true' : 'false')
    schedule()
  })

  document.querySelectorAll('[data-texture]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.texture = button.getAttribute('data-texture')
      setPressed('[data-texture]', 'data-texture', state.texture)
      syncLabels()
      if (state.mode === 'holes') schedule()
    })
  })
  document.querySelectorAll('[data-mode]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.mode = button.getAttribute('data-mode')
      setPressed('[data-mode]', 'data-mode', state.mode)
      syncLabels()
      schedule()
    })
  })
  ;['hole', 'light'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      syncLabels()
      if (state.mode === 'holes') schedule()
    })
  })
  $('knockColor').addEventListener('input', function () {
    if (state.knockout === 'color') schedule()
  })

  $('outline').addEventListener('click', function () {
    state.outline = !state.outline
    $('outline').setAttribute('aria-pressed', state.outline ? 'true' : 'false')
    syncLabels()
    schedule()
  })
  $('outlineMm').addEventListener('input', function () {
    syncLabels()
    if (state.outline) schedule()
  })

  viewport.addEventListener('wheel', function (event) {
    if (!event.ctrlKey) return
    event.preventDefault()
    zoomByWheel(event)
  }, { passive: false })

  $('zoomOut').addEventListener('click', function () { zoomBy(-1) })
  $('zoomIn').addEventListener('click', function () { zoomBy(1) })
  $('zoomFit').addEventListener('click', function () {
    state.zoom = 'fit'
    applyZoom()
  })
  $('zoomOne').addEventListener('click', function () {
    state.zoom = 1
    applyZoom()
  })
  window.addEventListener('resize', function () {
    if (state.zoom === 'fit') applyZoom()
  })

  downloadBtn.addEventListener('click', function () { exportPng('color') })
  downloadSvgBtn.addEventListener('click', exportSvg)
  downloadPdfBtn.addEventListener('click', exportPdf)
  downloadWhiteBtn.addEventListener('click', function () { exportPng('white') })
  $('demo').addEventListener('click', useDemo)

  syncLabels()
  syncButtons()
})()
