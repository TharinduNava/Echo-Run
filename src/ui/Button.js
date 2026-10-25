import Phaser from 'phaser';

const toHex = (c) => (typeof c === 'number' ? c : Phaser.Display.Color.HexStringToColor(c).color);

/**
 * Neon rounded-rect button usable with mouse, touch and keyboard focus.
 */
export class Button {
  constructor(scene, x, y, label, opts = {}) {
    const {
      width = 170, height = 38, color = '#00f5ff', fontSize = '13px',
      depth = 210, onClick = null, audio = null,
    } = opts;
    this.scene = scene;
    this.x = x; this.y = y;
    this.w = width; this.h = height;
    this._color = color;
    this._hex   = toHex(color);
    this._hover = false;
    this._focus = false;
    this._enabled = true;
    this._onClick = onClick;
    this._audio   = audio;

    this.gfx  = scene.add.graphics().setDepth(depth);
    this.text = scene.add.text(x, y, label, {
      fontFamily: 'Orbitron, monospace', fontSize, color,
    }).setOrigin(0.5).setDepth(depth + 1);
    this.hit = scene.add.rectangle(x, y, width, height, 0x000000, 0)
      .setDepth(depth + 2)
      .setInteractive({ useHandCursor: true });

    this.hit.on('pointerover', () => { this._hover = true;  this._draw(); if (this._enabled) this._audio?.playUiMove(); });
    this.hit.on('pointerout',  () => { this._hover = false; this._draw(); });
    this.hit.on('pointerdown', (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      this.press();
    });
    this._draw();
  }

  get parts() { return [this.gfx, this.text]; }

  press() {
    if (!this._enabled || !this._onClick) return;
    this._audio?.playUiSelect();
    this._onClick();
  }

  setLabel(label)  { this.text.setText(label); return this; }
  setFocus(f)      { this._focus = f; this._draw(); return this; }
  setEnabled(e)    { this._enabled = e; this.text.setAlpha(e ? 1 : 0.35); this._draw(); return this; }

  setColor(color) {
    this._color = color; this._hex = toHex(color);
    this.text.setColor(color);
    this._draw();
    return this;
  }

  setAlpha(a)   { this.gfx.setAlpha(a); this.text.setAlpha(a); return this; }

  setVisible(v) {
    this.gfx.setVisible(v); this.text.setVisible(v);
    if (v) this.hit.setInteractive(); else this.hit.disableInteractive();
    return this;
  }

  _draw() {
    const g = this.gfx, { x, y, w, h } = this;
    const lit = (this._hover || this._focus) && this._enabled;
    g.clear();
    g.fillStyle(0x000000, 0.75);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    g.fillStyle(this._hex, lit ? 0.18 : 0.06);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    g.lineStyle(lit ? 2 : 1.5, this._hex, this._enabled ? (lit ? 1 : 0.55) : 0.2);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
  }

  destroy() {
    this.gfx.destroy(); this.text.destroy(); this.hit.destroy();
  }
}

/**
 * Keyboard navigation over a list of buttons (UP/DOWN or LEFT/RIGHT + ENTER/SPACE).
 * Returns a teardown function.
 */
export function bindButtonNav(scene, buttons, { horizontal = false, audio = null, initial = 0 } = {}) {
  let idx = initial;
  const focus = (i) => {
    idx = (i + buttons.length) % buttons.length;
    buttons.forEach((b, j) => b.setFocus(j === idx));
  };
  focus(idx);
  const prevKeys = horizontal ? ['LEFT', 'A'] : ['UP', 'W'];
  const nextKeys = horizontal ? ['RIGHT', 'D'] : ['DOWN', 'S'];
  const onPrev  = () => { focus(idx - 1); audio?.playUiMove(); };
  const onNext  = () => { focus(idx + 1); audio?.playUiMove(); };
  const onPress = () => buttons[idx]?.press();
  const kb = scene.input.keyboard;
  prevKeys.forEach(k => kb.on(`keydown-${k}`, onPrev));
  nextKeys.forEach(k => kb.on(`keydown-${k}`, onNext));
  kb.on('keydown-ENTER', onPress);
  return () => {
    prevKeys.forEach(k => kb.off(`keydown-${k}`, onPrev));
    nextKeys.forEach(k => kb.off(`keydown-${k}`, onNext));
    kb.off('keydown-ENTER', onPress);
  };
}
