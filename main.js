const grid = (cols = 50, rows = 30, cv_w = 1100, cv_h = 600) => {
  // ==============
  const cv = canvas(cv_w, cv_h);
  const ctx = cv.getContext("2d");
  // ==============
  cv.cols = cols;
  cv.rows = rows;

  cv.cellh = cv.height / rows;
  cv.cellw = cv.width / cols;

  cv.max_val = 36;
  cv.min_val = 0;
  cv.range = cv.max_val - cv.min_val;
  cv.buffer = new Uint8Array(cols * rows).fill(0);

  cv.is_drawing = false;
  cv.draw_val = cv.max_val;
  cv.draw_indx = -1;

  cv.is_active = false;
  cv.pcolor = 0; // Primary color in hue val
  cv.fps = 24;

  // ==============

  cv._buffer = (n_cols, n_rows) => {
    n_cols = n_cols || cv.n_cols;
    n_rows = n_rows || cv.n_rows;
    // ==============
    const n_buffer = new Uint8Array(n_cols * n_rows).fill(0);
    const min_cols = Math.min(cv.cols, n_cols);
    const min_rows = Math.min(cv.rows, n_rows);
    // ==============
    for (let r = 0; r < min_rows; r++) {
      for (let c = 0; c < min_cols; c++) {
        n_buffer[r * n_cols + c] = cv.buffer[r * cv.cols + c];
      }
    }
    // ==============
    cv.buffer = n_buffer;
    cv.cols = n_cols;
    cv.rows = n_rows;
    cv.cellh = cv.height / n_rows;
    cv.cellw = cv.width / n_cols;
    // ==============
    return cv;
  };

  cv._size = (w, h) => {
    if (w) {
      cv._attribute({ width: w });
      cv.cellw = w / cv.cols;
    }
    if (h) {
      cv._attribute({ height: h });
      cv.cellh = h / cv.rows;
    }
    return cv;
  };
  cv._val = (max, min) => {
    const dv = cv.draw_val / cv.max_val;
    cv.max_val = max ?? cv.max_val;
    cv.min_val = min ?? cv.min_val;
    cv.range = cv.max_val - cv.min_val;
    cv.draw_val = dv * cv.max_val;
    return cv;
  };

  cv._change = (obj = {}) => {
    if (obj.cols || obj.rows) cv._buffer(obj.cols, obj.rows);
    if (obj.width || obj.height) cv._size(obj.width, obj.height);
    if (obj.max_val || obj.min_val) cv._val(obj.max_val, obj.min_val);
    if (obj.pcolor) cv.pcolor = obj.pcolor;
    if (obj.fps) cv.fps = obj.fps;
    return cv;
  };

  // ==============
  cv._color = (val) => {
    const ratio = val / cv.range;
    const lig = ratio * 100;
    return `hsl(${cv.pcolor}, 100%, ${lig}%)`;
  };

  cv._render = function () {
    let i = 0;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = col * this.cellw;
        const y = row * this.cellh;
        ctx.fillStyle = this._color(this.buffer[i]);
        ctx.fillRect(x, y, this.cellw, this.cellh);
        i++;
      }
    }
  };

  cv.on_frame = () => {};
  cv._next_frame = function () {
    this.on_frame();
    this._render();
  };

  cv._loop = function (
    time = performance.now(),
    laste_time = performance.now(),
  ) {
    if (!this.is_active) return;
    const ft = 1000 / Math.max(this.fps, 1);
    const dt = time - laste_time;
    if (dt >= ft) {
      this._next_frame();
      laste_time = time;
    }
    requestAnimationFrame((t) => this._loop(t, laste_time));
  };

  // ==============
  cv.on_start = () => {};
  cv._start = function () {
    if (!this.is_active) {
      this.is_active = true;
      this.on_start();
      this._loop();
    }
    return this;
  };

  cv.on_stop = () => {};
  cv._stop = function () {
    if (this.is_active) {
      this.is_active = false;
      this.on_stop();
    }
    return this;
  };

  // ==============
  cv._mouse_grid_indx = function (e) {
    const { left, top } = this.getBoundingClientRect();
    const gridX = Math.floor((e.clientX - left) / this.cellw);
    const gridY = Math.floor((e.clientY - top) / this.cellh);

    if (gridX < 0 || gridX >= this.cols || gridY < 0 || gridY >= this.rows)
      return;
    return gridY * this.cols + gridX;
  };

  cv.draw = () => {};
  cv._draw = function (i) {
    if (this.draw_indx != i) this.draw(i);
    if (!cv.is_rendering) cv._render();
    this.draw_indx = i;
  };

  cv.addEventListener("mousedown", function (e) {
    this.is_drawing = true;
    this._draw(this._mouse_grid_indx(e));
  });

  cv.addEventListener("mousemove", function (e) {
    if (this.is_drawing) this._draw(this._mouse_grid_indx(e));
  });

  window.addEventListener("mouseup", () => {
    cv.is_drawing = false;
    cv.draw_indx = -1;
  });

  // ==============
  cv._to_str = function () {
    if (!this.buffer || this.buffer.length === 0) return null;
    const { buffer, cols, rows, min_val, max_val } = this;
    // ==============
    const range = max_val - min_val;
    const useUint16 = range > 255;
    const nbytes = useUint16 ? 2 : 1;
    const maxCount = useUint16 ? 65535 : 255;

    const toHex = (num, bytes) =>
      Math.floor(num)
        .toString(16)
        .padStart(bytes * 2, "0");
    // ==============
    const header = [
      toHex(cols, 2),
      toHex(rows, 2),
      toHex(min_val, 2),
      toHex(max_val, 2),
      toHex(nbytes, 2),
    ];
    let hexString = header.join("/");
    // ==============
    const dataPairs = [];
    let count = 0;
    let last = buffer[0];

    for (let i = 0; i < buffer.length; i++) {
      const val = buffer[i];
      if (val === last && count < maxCount) {
        count++;
      } else {
        dataPairs.push(toHex(count, nbytes), toHex(last - min_val, nbytes));
        last = val;
        count = 1;
      }
    }
    dataPairs.push(toHex(count, nbytes), toHex(last - min_val, nbytes));
    hexString += "/" + dataPairs.join("");
    // ==============
    return hexString;
  };

  cv._from_str = function (hexString) {
    if (!hexString) return null;
    const parts = hexString.split("/");
    if (parts.length < 6) return null;
    // ==============
    const cols = parseInt(parts[0], 16);
    const rows = parseInt(parts[1], 16);
    const min_val = parseInt(parts[2], 16);
    const max_val = parseInt(parts[3], 16);
    const nbytes = parseInt(parts[4], 16);
    cv._change({ cols: cols, rows: rows, min_val: min_val, max_val: max_val });
    // ==============
    const dataString = parts[5];
    const charsPerValue = nbytes * 2; // 1 byte = 2 chars, 2 bytes = 4 chars
    const buffer = [];

    for (let i = 0; i < dataString.length; i += charsPerValue * 2) {
      const countHex = dataString.substr(i, charsPerValue);
      const count = parseInt(countHex, 16);

      const valHex = dataString.substr(i + charsPerValue, charsPerValue);
      const val = parseInt(valHex, 16) + min_val;

      for (let k = 0; k < count; k++) {
        buffer.push(val);
      }
    }
    cv.buffer = buffer;
    // ==============
    return true;
  };

  // ==============
  return cv;
};

// ==================================

const cellular_automata = (game_indx) => {
  const g = grid();
  let next_grid = Array(g.buffer.length);
  // ==================================
  g.draw = function (indx) {
    if (indx == undefined) return;
    if (indx < 0 || indx > this.buffer.length) return;
    // ==============
    let val = this.buffer[indx] ? this.min_val : this.draw_val;
    this.buffer[indx] = val;
  };

  // ==================================
  g.neighbors = function (indx) {
    const cols = g.cols;
    const rows = g.rows;
    // ==============
    const x = indx % cols;
    const y = Math.floor(indx / cols);
    // ==============
    let nbrs = Array(g.max_val + 1).fill(0);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) nbrs[0]++;
        else nbrs[g.buffer[ny * cols + nx]]++;
      }
    }
    return nbrs;
  };

  // ==================================
  const game_of_life = function (indx) {
    const cell = g.buffer[indx];
    const nbs = 8 - this.neighbors(indx)[0];
    let next = 0;
    if (cell > 0 && (nbs === 2 || nbs === 3)) next = cell - 1;
    if (cell === 0 && nbs === 3) next = g.max_val;
    return next;
  };

  const game_on_fire = function (indx) {
    const a = indx + this.cols;
    const buffer = this.buffer;
    if (a >= buffer.length) return buffer[indx];
    // ==============
    const nbrs = this.neighbors(indx)[0];
    const decay = Math.random() < 0.5 ? 0 : 1;
    // ==============
    let next = buffer[a] - nbrs - decay;
    if (next < 0) next = 0;
    return next;
  };
  // ==================================
  g.on_frame = function () {
    for (let i = 0; i < g.buffer.length; i++) next_grid[i] = this.next_cell(i);
    [this.buffer, next_grid] = [next_grid, this.buffer];
  };

  // ==================================
  g._set_game = (i) => {
    switch (i) {
      case 1:
        g.next_cell = game_on_fire;
        g._change({ fps: 20, pcolor: 10 });
        break;

      default:
        g.next_cell = game_of_life;
        g._change({ fps: 10, pcolor: 65, max_val: 16 });
        break;
    }
  };

  // ==================================
  g._set_game(game_indx);
  return g;
};

// ==================================

const game = () => {
  const g = cellular_automata();
  const inp = textinp("code");
  inp._append(
    button("set")
      ._style({ margin: "0", borderStyle: "none" })
      ._onclick(() => {
        g._from_str(inp.val());
        if (!g.is_rendering) g._render();
      }),
  );

  const colp = colorp(g.pcolor, (g.draw_val / g.max_val) * 100, (hue, lit) => {
    g.pcolor = hue;
    g.draw_val = (lit * g.max_val) / 100;
    if (!g.is_rendering) g._render();
  });

  const control_panel = div("_control_panel")._append(
    flex()
      ._append
      // color_picker()._on_change((hue, lit) => {
      //   g.pcolor = hue;
      //   g.draw_val = (lit * g.max_val) / 100;
      // }),
      (),
    inp,
    flex()
      ._append(
        flex()._append(
          button("start")
            ._click((b) => (b.textContent = g.is_active ? "start" : "stop"))
            ._click(() => (g.is_active ? g._stop() : g._start())),
          button("next")._onclick(() => g._next_frame()),
          button("reset")
            ._click(() => g.buffer.fill(0))
            ._click(() => g._next_frame()),
        ),

        copy(() => g._to_str()),
      )
      ._style({ justifyContent: "space-between" }),
  );

  return div("_game")
    ._append(
      flex("_panel")
        ._append(inp, colp)
        ._style({ justifyContent: "space-between" }),
      flex("_control")
        ._append(
          div()._append(
            button("start")
              ._click((b) => (b.textContent = g.is_active ? "start" : "stop"))
              ._click(() => (g.is_active ? g._stop() : g._start())),
            button("next")._onclick(() => g._next_frame()),
            button("reset")
              ._click(() => g.buffer.fill(0))
              ._click(() => g._next_frame()),
          ),
          copy(() => g._to_str()),
        )
        ._style({ justifyContent: "space-between" }),
      g,
    )
    ._style({ width: "fit-content" });
};

// ==================================
window.onload = () => {
  init()._append(flex()._append(game())._style({ justifyContent: "center" }));
};
