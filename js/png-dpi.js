// Grava o chunk pHYs para o RIP ler o tamanho físico do PNG.
// Sem isso, muita gráfica abre o arquivo em 72 DPI e a arte sai gigante.

(function () {
  function crc32(bytes) {
    let crc = 0xffffffff
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i]
      for (let bit = 0; bit < 8; bit++) {
        const mask = -(crc & 1)
        crc = (crc >>> 1) ^ (0xedb88320 & mask)
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function injectPngDpi(bytes, dpi) {
    if (bytes.length < 8) return bytes
    const signature = [137, 80, 78, 71, 13, 10, 26, 10]
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== signature[i]) return bytes
    }

    const ppm = Math.round(dpi / 0.0254)
    const typeAndData = new Uint8Array(13)
    typeAndData[0] = 112
    typeAndData[1] = 72
    typeAndData[2] = 89
    typeAndData[3] = 115
    const view = new DataView(typeAndData.buffer)
    view.setUint32(4, ppm)
    view.setUint32(8, ppm)
    typeAndData[12] = 1

    const chunk = new Uint8Array(21)
    const chunkView = new DataView(chunk.buffer)
    chunkView.setUint32(0, 9)
    chunk.set(typeAndData, 4)
    chunkView.setUint32(17, crc32(typeAndData))

    const parts = [bytes.slice(0, 8)]
    let offset = 8
    let inserted = false
    while (offset + 12 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      )
      const total = 12 + length
      if (offset + total > bytes.length) break
      if (type === 'pHYs') {
        offset += total
        continue
      }
      if (!inserted && type === 'IDAT') {
        parts.push(chunk)
        inserted = true
      }
      parts.push(bytes.slice(offset, offset + total))
      offset += total
      if (type === 'IEND') break
    }

    const size = parts.reduce(function (sum, part) { return sum + part.length }, 0)
    const out = new Uint8Array(size)
    let cursor = 0
    for (let i = 0; i < parts.length; i++) {
      out.set(parts[i], cursor)
      cursor += parts[i].length
    }
    return out
  }

  window.injectPngDpi = injectPngDpi
})()
