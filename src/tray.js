const { Tray, Menu, nativeImage } = require('electron');
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeSolidPng(r, g, b, size = 16) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * rowSize + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONS = {
  green: nativeImage.createFromBuffer(makeSolidPng(16, 185, 129)),
  red: nativeImage.createFromBuffer(makeSolidPng(239, 68, 68)),
  grey: nativeImage.createFromBuffer(makeSolidPng(156, 163, 175)),
};

function createStatusTray({ onShow, onQuit }) {
  const tray = new Tray(ICONS.grey);
  tray.setToolTip('Enteam Interview Monitor — scanning…');

  let latestScan = null;

  function buildMenu() {
    const statusLabel = !latestScan
      ? 'Scanning…'
      : latestScan.clean
        ? '✓ Environment clean'
        : `⚠ ${latestScan.detections.length} helper tool(s) detected`;

    const detectionItems = (latestScan?.detections || [])
      .slice(0, 5)
      .map((d) => ({ label: `  • ${d.matched}`, enabled: false }));

    const template = [
      { label: statusLabel, enabled: false },
      ...detectionItems,
      { type: 'separator' },
      { label: 'Show window', click: () => onShow && onShow() },
      { label: 'Quit monitor', click: () => onQuit && onQuit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  function update(scan) {
    latestScan = scan;
    if (!scan) {
      tray.setImage(ICONS.grey);
      tray.setToolTip('Enteam Interview Monitor — scanning…');
    } else if (scan.clean) {
      tray.setImage(ICONS.green);
      tray.setToolTip('Enteam Interview Monitor — environment clean');
    } else {
      tray.setImage(ICONS.red);
      tray.setToolTip(
        `Enteam Interview Monitor — ${scan.detections.length} helper(s) detected`,
      );
    }
    buildMenu();
  }

  buildMenu();

  return {
    update,
    destroy() {
      tray.destroy();
    },
  };
}

module.exports = { createStatusTray };
