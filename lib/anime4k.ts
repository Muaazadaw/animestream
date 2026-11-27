"use client";

// Real-time Anime4K upscaling (https://github.com/bloc97/Anime4K) through its
// WebGPU port (anime4k-webgpu). The video is drawn through the Anime4K shaders
// onto a canvas laid exactly over it. Needs WebGPU (Chrome / Edge on a computer,
// recent Safari), so it's off by default and reports why when it can't run.
//
// The package's own render() helper never stops its frame loop, so this file
// does the small part it did (copy frame → run shaders → draw) with a loop that
// can be switched off.

export type UpscaleMode = "off" | "A" | "B" | "C";

export const UPSCALE_MODES: { id: UpscaleMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Plain video" },
  { id: "A", label: "Mode A", hint: "Sharpest. Best for 1080p streams" },
  { id: "B", label: "Mode B", hint: "Softer. For blurry or 720p streams" },
  { id: "C", label: "Mode C", hint: "For low-resolution streams" },
];

const KEY = "as:anime4k";
export const UPSCALE_EVENT = "as:anime4k";

export function getUpscaleMode(): UpscaleMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "A" || v === "B" || v === "C" ? v : "off";
  } catch {
    return "off";
  }
}

export function setUpscaleMode(mode: UpscaleMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(UPSCALE_EVENT));
}

// Full-screen triangle that samples the last Anime4K output texture.
const SHADER = /* wgsl */ `
struct Out { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: Out;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f((p[i].x + 1.0) * 0.5, (1.0 - p[i].y) * 0.5);
  return o;
}
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;
@fragment fn fs(o: Out) -> @location(0) vec4f { return textureSample(t, s, o.uv); }
`;

/**
 * Start upscaling `video` (already inside Plyr's wrapper). Resolves to a stop
 * function. Rejects with a readable message when the browser can't do it;
 * `onError` reports problems that show up later (e.g. the GPU resets).
 */
export async function startAnime4K(video: HTMLVideoElement, mode: Exclude<UpscaleMode, "off">, onError: (message: string) => void) {
  if (!("gpu" in navigator)) throw new Error("Anime4K needs WebGPU: use Chrome or Edge on a computer.");
  const lib = await import("anime4k-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("Anime4K couldn't get your graphics card (WebGPU is off or blocked).");
  const device = await adapter.requestDevice();
  const wrap = video.parentElement;
  if (!wrap) throw new Error("Anime4K couldn't find the player.");

  const canvas = document.createElement("canvas");
  canvas.className = "a4k-canvas";
  wrap.appendChild(canvas);
  const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!ctx) {
    canvas.remove();
    device.destroy();
    throw new Error("Anime4K couldn't draw on this page.");
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: SHADER });
  const draw3 = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const Preset = { A: lib.ModeA, B: lib.ModeB, C: lib.ModeC }[mode];

  let stopped = false;
  let input: GPUTexture | null = null;
  let stages: { pass(e: GPUCommandEncoder): void; getOutputTexture(): GPUTexture }[] = [];
  let bind: GPUBindGroup | null = null;
  let built = "";

  // Size the canvas to the rectangle the video fills (letterboxed like object-fit: contain),
  // and rebuild the shaders when the stream's resolution or the player's size changes.
  const layout = () => {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !W || !H) return false;
    let w = W;
    let h = W / (vw / vh);
    if (h > H) {
      h = H;
      w = H * (vw / vh);
    }
    Object.assign(canvas.style, { width: `${w}px`, height: `${h}px`, left: `${(W - w) / 2}px`, top: `${(H - h) / 2}px` });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.min(3840, Math.round(w * dpr));
    const ch = Math.min(2160, Math.round(h * dpr));
    const key = `${vw}x${vh}>${cw}x${ch}`;
    if (key === built) return true;
    built = key;
    canvas.width = cw;
    canvas.height = ch;
    input?.destroy();
    input = device.createTexture({
      size: [vw, vh, 1],
      format: "rgba16float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    stages = [
      new Preset({ device, inputTexture: input, nativeDimensions: { width: vw, height: vh }, targetDimensions: { width: cw, height: ch } }),
    ];
    bind = device.createBindGroup({
      layout: draw3.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: stages[stages.length - 1].getOutputTexture().createView() },
      ],
    });
    return true;
  };

  const draw = () => {
    if (stopped || video.readyState < 2 || !layout() || !input || !bind) return;
    device.queue.copyExternalImageToTexture({ source: video }, { texture: input }, [video.videoWidth, video.videoHeight]);
    const enc = device.createCommandEncoder();
    for (const s of stages) s.pass(enc);
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(draw3);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
    // Keep the poster visible until the video has actually started.
    canvas.style.opacity = video.currentTime > 0 ? "1" : "0";
  };

  const fail = (message: string) => {
    stop();
    onError(message);
  };

  // New video frame → draw. Falls back to animation frames where frame callbacks aren't supported.
  const vfc = "requestVideoFrameCallback" in video;
  let handle = 0;
  const loop = () => {
    if (stopped) return;
    try {
      draw();
    } catch (e) {
      const blocked = (e as Error).name === "SecurityError";
      return fail(blocked ? "Anime4K can't read this server's video. Try another server." : "Anime4K stopped: your graphics card hit an error.");
    }
    handle = vfc ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
  };
  const redraw = () => {
    try {
      draw();
    } catch {
      /* the loop reports errors */
    }
  };
  const resize = new ResizeObserver(redraw);
  resize.observe(wrap);
  video.addEventListener("seeked", redraw);
  device.lost.then((info) => !stopped && info.reason !== "destroyed" && fail("Anime4K stopped: the graphics card was reset."));
  loop();

  function stop() {
    if (stopped) return;
    stopped = true;
    if (vfc) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
    resize.disconnect();
    video.removeEventListener("seeked", redraw);
    canvas.remove();
    device.destroy();
  }
  return stop;
}
