/**
 * Floating virtual joystick (touch anywhere) plus tap regions for HUD actions.
 * Joystick only engages for touch pointers; tap regions work for mouse and touch.
 */
export class TouchControls {
  constructor(scene) {
    this.scene   = scene;
    this.vector  = { x: 0, y: 0 };
    this.isTouch = !!scene.sys.game.device.input.touch;
    this.enabled = true;

    this._joyId = null;
    this._ox = 0; this._oy = 0;
    this._kx = 0; this._ky = 0;
    this._radius = 52;
    this._regions = [];

    this._gfx = scene.add.graphics().setDepth(65);
    scene.input.addPointer(2);

    scene.input.on('pointerdown',      this._onDown, this);
    scene.input.on('pointermove',      this._onMove, this);
    scene.input.on('pointerup',        this._onUp,   this);
    scene.input.on('pointerupoutside', this._onUp,   this);
  }

  /** rect: {x, y, w, h} in game coords (top-left origin). */
  addRegion(rect, onPress) { this._regions.push({ rect, onPress }); }

  _onDown(pointer, over) {
    if (!this.enabled || (over && over.length)) return;
    const region = this._regions.find(({ rect: r }) =>
      pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h);
    if (region) { region.onPress(); return; }

    if (!pointer.wasTouch || this._joyId !== null) return;
    this._joyId = pointer.id;
    this._ox = this._kx = pointer.x;
    this._oy = this._ky = pointer.y;
    this._draw();
  }

  _onMove(pointer) {
    if (pointer.id !== this._joyId) return;
    let dx = pointer.x - this._ox, dy = pointer.y - this._oy;
    const len = Math.hypot(dx, dy);
    if (len > this._radius) { dx = dx / len * this._radius; dy = dy / len * this._radius; }
    this._kx = this._ox + dx; this._ky = this._oy + dy;
    // Small dead zone, then analog magnitude up to 1
    const mag = Math.min(1, len / this._radius);
    this.vector = mag < 0.12 ? { x: 0, y: 0 } : { x: dx / this._radius, y: dy / this._radius };
    this._draw();
  }

  _onUp(pointer) {
    if (pointer.id !== this._joyId) return;
    this.release();
  }

  release() {
    this._joyId = null;
    this.vector = { x: 0, y: 0 };
    this._gfx.clear();
  }

  setEnabled(e) {
    this.enabled = e;
    if (!e) this.release();
  }

  _draw() {
    const g = this._gfx;
    g.clear();
    if (this._joyId === null) return;
    g.fillStyle(0x00f5ff, 0.06);  g.fillCircle(this._ox, this._oy, this._radius);
    g.lineStyle(1.5, 0x00f5ff, 0.35); g.strokeCircle(this._ox, this._oy, this._radius);
    g.fillStyle(0x00f5ff, 0.35);  g.fillCircle(this._kx, this._ky, 20);
    g.lineStyle(1.5, 0xffffff, 0.5); g.strokeCircle(this._kx, this._ky, 20);
  }

  destroy() {
    const input = this.scene.input;
    input.off('pointerdown',      this._onDown, this);
    input.off('pointermove',      this._onMove, this);
    input.off('pointerup',        this._onUp,   this);
    input.off('pointerupoutside', this._onUp,   this);
    this._gfx.destroy();
  }
}
