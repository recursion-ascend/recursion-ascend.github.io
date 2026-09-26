/* Hero background: incompressible Navier–Stokes on the GPU (Stam's "Stable Fluids").
   Each frame: vorticity confinement -> divergence -> Jacobi pressure solve ->
   projection -> semi-Lagrangian advection of velocity and dye.
   Falls back to the ring all-reduce canvas (main.js) when WebGL / float render
   targets are unavailable or the viewer prefers reduced motion. */
(function () {
  "use strict";

  var canvas = document.getElementById("fluid");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var hero = canvas.parentElement;
  var small = Math.min(window.innerWidth, window.innerHeight) < 700;

  var CFG = {
    SIM_RES: small ? 96 : 128,
    DYE_RES: small ? 512 : 1024,
    DENSITY_DISSIPATION: 0.45,  // per-second decay of dye
    VELOCITY_DISSIPATION: 0.25,
    PRESSURE: 0.8,              // warm start for the Jacobi solve
    PRESSURE_ITERATIONS: 20,
    CURL: 28,                   // vorticity confinement strength
    SPLAT_RADIUS: 0.22,
    SPLAT_FORCE: 5200,
    DYE_INTENSITY: 0.16
  };

  var gl, ext;
  try {
    var ctx = getWebGLContext(canvas);
    if (!ctx) return;
    gl = ctx.gl;
    ext = ctx.ext;
  } catch (e) {
    return;
  }

  /* ---------------- context + float render targets ---------------- */
  function getWebGLContext(cv) {
    var params = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
    var g = cv.getContext("webgl2", params);
    var isGL2 = !!g;
    if (!isGL2) g = cv.getContext("webgl", params) || cv.getContext("experimental-webgl", params);
    if (!g) return null;

    var halfFloat, linear, halfType;
    if (isGL2) {
      g.getExtension("EXT_color_buffer_float");
      linear = g.getExtension("OES_texture_float_linear");
      halfType = g.HALF_FLOAT;
    } else {
      halfFloat = g.getExtension("OES_texture_half_float");
      linear = g.getExtension("OES_texture_half_float_linear");
      if (!halfFloat) return null;
      halfType = halfFloat.HALF_FLOAT_OES;
    }
    g.clearColor(0, 0, 0, 0);

    var rgba, rg, r;
    if (isGL2) {
      rgba = supportedFormat(g, g.RGBA16F, g.RGBA, halfType);
      rg = supportedFormat(g, g.RG16F, g.RG, halfType);
      r = supportedFormat(g, g.R16F, g.RED, halfType);
    } else {
      rgba = rg = r = supportedFormat(g, g.RGBA, g.RGBA, halfType);
    }
    if (!rgba || !rg || !r) return null;
    return { gl: g, ext: { rgba: rgba, rg: rg, r: r, halfType: halfType, linear: !!linear } };
  }

  function supportedFormat(g, internalFormat, format, type) {
    if (!renderable(g, internalFormat, format, type)) {
      if (internalFormat === g.R16F) return supportedFormat(g, g.RG16F, g.RG, type);
      if (internalFormat === g.RG16F) return supportedFormat(g, g.RGBA16F, g.RGBA, type);
      return null;
    }
    return { internalFormat: internalFormat, format: format };
  }

  function renderable(g, internalFormat, format, type) {
    var tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    var fbo = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    var ok = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.deleteFramebuffer(fbo);
    g.deleteTexture(tex);
    return ok;
  }

  /* ---------------- shaders ---------------- */
  var VERT = [
    "precision highp float;",
    "attribute vec2 aPosition;",
    "varying vec2 vUv, vL, vR, vT, vB;",
    "uniform vec2 texelSize;",
    "void main () {",
    "  vUv = aPosition * 0.5 + 0.5;",
    "  vL = vUv - vec2(texelSize.x, 0.0);",
    "  vR = vUv + vec2(texelSize.x, 0.0);",
    "  vT = vUv + vec2(0.0, texelSize.y);",
    "  vB = vUv - vec2(0.0, texelSize.y);",
    "  gl_Position = vec4(aPosition, 0.0, 1.0);",
    "}"
  ].join("\n");

  var HEAD = "precision highp float;\nprecision highp sampler2D;\nvarying vec2 vUv, vL, vR, vT, vB;\n";

  var FRAG = {
    clear: HEAD + [
      "uniform sampler2D uTexture;",
      "uniform float value;",
      "void main () { gl_FragColor = value * texture2D(uTexture, vUv); }"
    ].join("\n"),

    splat: HEAD + [
      "uniform sampler2D uTarget;",
      "uniform float aspectRatio;",
      "uniform vec3 color;",
      "uniform vec2 point;",
      "uniform float radius;",
      "void main () {",
      "  vec2 p = vUv - point;",
      "  p.x *= aspectRatio;",
      "  vec3 splat = exp(-dot(p, p) / radius) * color;",
      "  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);",
      "}"
    ].join("\n"),

    advection: HEAD + [
      "uniform sampler2D uVelocity;",
      "uniform sampler2D uSource;",
      "uniform vec2 texelSize;",
      "uniform vec2 dyeTexelSize;",
      "uniform float dt;",
      "uniform float dissipation;",
      "vec4 bilerp (sampler2D sam, vec2 uv, vec2 ts) {",
      "  vec2 st = uv / ts - 0.5;",
      "  vec2 iuv = floor(st);",
      "  vec2 fuv = fract(st);",
      "  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * ts);",
      "  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * ts);",
      "  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * ts);",
      "  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * ts);",
      "  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);",
      "}",
      "void main () {",
      "#ifdef MANUAL_FILTERING",
      "  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;",
      "  vec4 result = bilerp(uSource, coord, dyeTexelSize);",
      "#else",
      "  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;",
      "  vec4 result = texture2D(uSource, coord);",
      "#endif",
      "  gl_FragColor = result / (1.0 + dissipation * dt);",
      "}"
    ].join("\n"),

    // central differences, free-slip walls (reflect the normal component)
    divergence: HEAD + [
      "uniform sampler2D uVelocity;",
      "void main () {",
      "  float L = texture2D(uVelocity, vL).x;",
      "  float R = texture2D(uVelocity, vR).x;",
      "  float T = texture2D(uVelocity, vT).y;",
      "  float B = texture2D(uVelocity, vB).y;",
      "  vec2 C = texture2D(uVelocity, vUv).xy;",
      "  if (vL.x < 0.0) { L = -C.x; }",
      "  if (vR.x > 1.0) { R = -C.x; }",
      "  if (vT.y > 1.0) { T = -C.y; }",
      "  if (vB.y < 0.0) { B = -C.y; }",
      "  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);",
      "}"
    ].join("\n"),

    curl: HEAD + [
      "uniform sampler2D uVelocity;",
      "void main () {",
      "  float L = texture2D(uVelocity, vL).y;",
      "  float R = texture2D(uVelocity, vR).y;",
      "  float T = texture2D(uVelocity, vT).x;",
      "  float B = texture2D(uVelocity, vB).x;",
      "  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);",
      "}"
    ].join("\n"),

    vorticity: HEAD + [
      "uniform sampler2D uVelocity;",
      "uniform sampler2D uCurl;",
      "uniform float curl;",
      "uniform float dt;",
      "void main () {",
      "  float L = texture2D(uCurl, vL).x;",
      "  float R = texture2D(uCurl, vR).x;",
      "  float T = texture2D(uCurl, vT).x;",
      "  float B = texture2D(uCurl, vB).x;",
      "  float C = texture2D(uCurl, vUv).x;",
      "  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));",
      "  force /= length(force) + 0.0001;",
      "  force *= curl * C;",
      "  force.y *= -1.0;",
      "  vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;",
      "  gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);",
      "}"
    ].join("\n"),

    // one Jacobi sweep for  Δp = ∇·u
    pressure: HEAD + [
      "uniform sampler2D uPressure;",
      "uniform sampler2D uDivergence;",
      "void main () {",
      "  float L = texture2D(uPressure, vL).x;",
      "  float R = texture2D(uPressure, vR).x;",
      "  float T = texture2D(uPressure, vT).x;",
      "  float B = texture2D(uPressure, vB).x;",
      "  float div = texture2D(uDivergence, vUv).x;",
      "  gl_FragColor = vec4(0.25 * (L + R + B + T - div), 0.0, 0.0, 1.0);",
      "}"
    ].join("\n"),

    // projection  u <- u - ∇p
    gradient: HEAD + [
      "uniform sampler2D uPressure;",
      "uniform sampler2D uVelocity;",
      "void main () {",
      "  float L = texture2D(uPressure, vL).x;",
      "  float R = texture2D(uPressure, vR).x;",
      "  float T = texture2D(uPressure, vT).x;",
      "  float B = texture2D(uPressure, vB).x;",
      "  vec2 vel = texture2D(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);",
      "  gl_FragColor = vec4(vel, 0.0, 1.0);",
      "}"
    ].join("\n"),

    // dye -> straight-alpha ink, lightly shaded by the dye gradient
    display: HEAD + [
      "uniform sampler2D uTexture;",
      "uniform vec2 texelSize;",
      "uniform float uAlpha;",
      "void main () {",
      "  vec3 c = texture2D(uTexture, vUv).rgb;",
      "  float dx = length(texture2D(uTexture, vR).rgb) - length(texture2D(uTexture, vL).rgb);",
      "  float dy = length(texture2D(uTexture, vT).rgb) - length(texture2D(uTexture, vB).rgb);",
      "  vec3 n = normalize(vec3(dx, dy, length(texelSize)));",
      "  float diffuse = clamp(n.z + 0.7, 0.7, 1.0);",
      "  float a = max(c.r, max(c.g, c.b));",
      "  vec3 col = (c / max(a, 0.0001)) * diffuse;",
      "  gl_FragColor = vec4(col, smoothstep(0.0, 0.9, a) * uAlpha);",
      "}"
    ].join("\n")
  };

  function compile(type, src, defines) {
    if (defines) src = defines.map(function (d) { return "#define " + d + "\n"; }).join("") + src;
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  var vertShader;
  function Program(fragSrc, defines) {
    var p = gl.createProgram();
    gl.attachShader(p, vertShader);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc, defines));
    gl.bindAttribLocation(p, 0, "aPosition");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.program = p;
    this.u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var name = gl.getActiveUniform(p, i).name;
      this.u[name] = gl.getUniformLocation(p, name);
    }
  }
  Program.prototype.bind = function () { gl.useProgram(this.program); return this.u; };

  var P;
  try {
    vertShader = compile(gl.VERTEX_SHADER, VERT);
    P = {
      clear: new Program(FRAG.clear),
      splat: new Program(FRAG.splat),
      advection: new Program(FRAG.advection, ext.linear ? null : ["MANUAL_FILTERING"]),
      divergence: new Program(FRAG.divergence),
      curl: new Program(FRAG.curl),
      vorticity: new Program(FRAG.vorticity),
      pressure: new Program(FRAG.pressure),
      gradient: new Program(FRAG.gradient),
      display: new Program(FRAG.display)
    };
  } catch (e) {
    return;
  }

  /* ---------------- full-screen quad ---------------- */
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target) {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------------- framebuffers ---------------- */
  function createFBO(w, h, fmt, filter) {
    gl.activeTexture(gl.TEXTURE0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, ext.halfType, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex: tex, fbo: fbo, width: w, height: h, tx: 1 / w, ty: 1 / h,
      attach: function (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; },
      free: function () { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); }
    };
  }
  function createDouble(w, h, fmt, filter) {
    var a = createFBO(w, h, fmt, filter), b = createFBO(w, h, fmt, filter);
    return {
      width: w, height: h, tx: 1 / w, ty: 1 / h,
      get read() { return a; },
      get write() { return b; },
      swap: function () { var t = a; a = b; b = t; },
      free: function () { a.free(); b.free(); }
    };
  }

  function resolution(res) {
    var aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    var lo = Math.round(res), hi = Math.round(res * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: hi, h: lo } : { w: lo, h: hi };
  }

  var dye, velocity, divergence, curl, pressure;
  function initFramebuffers() {
    [dye, velocity, divergence, curl, pressure].forEach(function (f) { if (f) f.free(); });
    var sim = resolution(CFG.SIM_RES), dr = resolution(CFG.DYE_RES);
    var filter = ext.linear ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);
    dye = createDouble(dr.w, dr.h, ext.rgba, filter);
    velocity = createDouble(sim.w, sim.h, ext.rg, filter);
    divergence = createFBO(sim.w, sim.h, ext.r, gl.NEAREST);
    curl = createFBO(sim.w, sim.h, ext.r, gl.NEAREST);
    pressure = createDouble(sim.w, sim.h, ext.r, gl.NEAREST);
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  /* ---------------- simulation step ---------------- */
  function step(dt) {
    gl.disable(gl.BLEND);
    var u;

    u = P.curl.bind();
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    blit(curl);

    u = P.vorticity.bind();
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uCurl, curl.attach(1));
    gl.uniform1f(u.curl, CFG.CURL);
    gl.uniform1f(u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    u = P.divergence.bind();
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    u = P.clear.bind();
    gl.uniform1i(u.uTexture, pressure.read.attach(0));
    gl.uniform1f(u.value, CFG.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    u = P.pressure.bind();
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uDivergence, divergence.attach(0));
    for (var i = 0; i < CFG.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    u = P.gradient.bind();
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uPressure, pressure.read.attach(0));
    gl.uniform1i(u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    u = P.advection.bind();
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    if (!ext.linear) gl.uniform2f(u.dyeTexelSize, velocity.tx, velocity.ty);
    var vid = velocity.read.attach(0);
    gl.uniform1i(u.uVelocity, vid);
    gl.uniform1i(u.uSource, vid);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, CFG.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!ext.linear) gl.uniform2f(u.dyeTexelSize, dye.tx, dye.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, dye.read.attach(1));
    gl.uniform1f(u.dissipation, CFG.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    var u = P.display.bind();
    gl.uniform2f(u.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(u.uTexture, dye.read.attach(0));
    gl.uniform1f(u.uAlpha, 0.92);
    blit(null);
  }

  /* ---------------- splats ---------------- */
  function aspect() { return canvas.width / canvas.height; }

  function splat(x, y, dx, dy, color, radiusScale) {
    var r = CFG.SPLAT_RADIUS / 100 * (radiusScale || 1);
    if (aspect() > 1) r *= aspect();
    var u = P.splat.bind();
    gl.uniform1i(u.uTarget, velocity.read.attach(0));
    gl.uniform1f(u.aspectRatio, aspect());
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0);
    gl.uniform1f(u.radius, r);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform3f(u.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  // Ink comes from the site's accent tokens, so it follows the theme.
  function themeRGB(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(",");
    return v.length === 3 ? v.map(function (x) { return +x / 255; }) : [0.3, 0.8, 0.7];
  }
  function inkColor() {
    var a = themeRGB("--accent-rgb"), b = themeRGB("--accent2-rgb");
    var t = Math.random();
    t = t < 0.45 ? t * 0.3 : t > 0.7 ? 1 - (1 - t) * 0.3 : t;  // favour the two poles
    var k = CFG.DYE_INTENSITY * (0.75 + Math.random() * 0.5);
    return [(a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k];
  }

  function randomSplats(n) {
    for (var i = 0; i < n; i++) {
      var x = 0.35 + Math.random() * 0.65, y = Math.random();
      var ang = Math.random() * Math.PI * 2, f = 600 + Math.random() * 700;
      var c = inkColor();
      splat(x, y, Math.cos(ang) * f, Math.sin(ang) * f, [c[0] * 6, c[1] * 6, c[2] * 6], 1.6);
    }
  }

  /* ---------------- pointer ---------------- */
  var pointer = { x: 0, y: 0, px: 0, py: 0, dx: 0, dy: 0, moved: false, down: false, color: inkColor(), inside: false };
  var colorTimer = 0;

  function updatePointer(e, first) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    var y = 1 - (e.clientY - r.top) / r.height;
    if (first || !pointer.inside) { pointer.px = x; pointer.py = y; }
    else { pointer.px = pointer.x; pointer.py = pointer.y; }
    pointer.x = x;
    pointer.y = y;
    var ar = aspect();
    pointer.dx = (x - pointer.px) * (ar < 1 ? ar : 1);
    pointer.dy = (y - pointer.py) / (ar > 1 ? ar : 1);
    pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
    pointer.inside = true;
  }

  hero.addEventListener("pointermove", function (e) { updatePointer(e, false); });
  hero.addEventListener("pointerleave", function () { pointer.inside = false; pointer.moved = false; });
  hero.addEventListener("pointerdown", function (e) {
    updatePointer(e, true);
    var c = inkColor();
    splat(pointer.x, pointer.y, (Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 1500, [c[0] * 8, c[1] * 8, c[2] * 8], 1.4);
  });

  /* ---------------- loop ---------------- */
  var running = false, raf = 0, last = 0, inView = true, ambient = 0, frames = 0;

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.016667);
    last = now;
    if (resizeCanvas()) initFramebuffers();

    colorTimer += dt;
    if (colorTimer > 0.35) { colorTimer = 0; pointer.color = inkColor(); }
    if (pointer.moved) {
      pointer.moved = false;
      splat(pointer.x, pointer.y, pointer.dx * CFG.SPLAT_FORCE, pointer.dy * CFG.SPLAT_FORCE, pointer.color, 1);
    }
    // keep it alive without a cursor (and on touch screens)
    ambient -= dt;
    if (ambient <= 0) { ambient = 0.9 + Math.random() * 1.2; randomSplats(Math.random() < 0.35 ? 2 : 1); }

    step(dt);
    render();
    frames++;
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  hero.classList.add("fluid-on"); // show the canvas before measuring it
  try {
    resizeCanvas();
    initFramebuffers();
    randomSplats(5);
  } catch (e) {
    hero.classList.remove("fluid-on");
    return;
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView && !document.hidden) start(); else stop();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (inView) start();
  });
  start();

  window.FluidHero = { active: true, frames: function () { return frames; } };
})();
